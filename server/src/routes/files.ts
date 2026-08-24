// archiver v8 est passe en ESM : plus de fabrique par defaut, on instancie
// directement la classe.
import { ZipArchive } from 'archiver'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../db.js'
import { canReadGallery, readClient, readSession } from '../auth.js'
import * as storage from '../storage.js'
import { rendition, THUMB_WIDTH } from '../images.js'
import { noteDownloaded } from '../tracking.js'
import { PREVIEW_WIDTH, watermark } from '../watermark.js'

/**
 * Service des fichiers photo.
 *
 * Aucune photo n'est servie en statique : chaque requete verifie que le
 * demandeur a bien saisi le code de la galerie (ou qu'il s'agit de la
 * photographe connectee). Sans ca, connaitre une URL suffirait a tout voir.
 *
 * Sur une galerie limitee, ce qui s'affiche est filigrane et borne en
 * definition. Les fichiers telecharges, eux, partent toujours intacts.
 */
export default async function fileRoutes(app: FastifyInstance) {
  async function loadAuthorizedPhoto(request: FastifyRequest, photoId: string) {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { gallery: true },
    })
    if (!photo) return { photo: null, allowed: false as const }

    const allowed = await canReadGallery(request, photo.gallery)
    return { photo, allowed }
  }

  /**
   * Version filigranee, fabriquee a la demande puis gardee sur le disque :
   * recomposer l'image a chaque requete couterait bien trop cher.
   */
  async function watermarkedBuffer(
    galleryId: string,
    photoId: string,
    sourceKey: string,
    maxWidth: number,
    variant: 'thumb' | 'preview',
  ): Promise<Buffer> {
    const cacheKey = storage.watermarkKey(galleryId, photoId, variant)

    if (await storage.exists(cacheKey)) {
      return storage.readBuffer(cacheKey)
    }

    const source = await storage.readBuffer(sourceKey)
    const marked = await watermark(source, maxWidth)
    await storage.put(cacheKey, marked)
    return marked
  }

  /**
   * La photographe demande-t-elle explicitement l'image sans filigrane ?
   *
   * Reserve a sa session, et sur demande explicite seulement : son apercu
   * client doit continuer de montrer le filigrane, c'est tout l'interet de
   * previsualiser. Seul l'atelier de stories passe ce drapeau.
   */
  async function wantsOriginal(request: FastifyRequest): Promise<boolean> {
    const query = request.query as { original?: string } | undefined
    if (query?.original !== '1') return false
    return (await readSession(request)) !== null
  }

  /** Vignette de la grille. */
  app.get<{ Params: { photoId: string } }>(
    '/api/photos/:photoId/thumb',
    async (request, reply) => {
      const { photo, allowed } = await loadAuthorizedPhoto(request, request.params.photoId)
      if (!photo) return reply.code(404).send({ error: 'not_found' })
      if (!allowed) return reply.code(403).send({ error: 'forbidden' })

      if (photo.gallery.limitedSelection && !(await wantsOriginal(request))) {
        const body = await watermarkedBuffer(
          photo.galleryId,
          photo.id,
          // Sur un RAW, on filigrane l'apercu : l'original n'est pas decodable.
          photo.previewKey ?? photo.storageKey,
          THUMB_WIDTH,
          'thumb',
        )
        return reply
          .header('Content-Type', 'image/webp')
          .header('Cache-Control', 'private, max-age=86400')
          .send(body)
      }

      if (!(await storage.exists(photo.thumbKey))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return reply
        .header('Content-Type', 'image/webp')
        // Privee : jamais mise en cache par un intermediaire partage.
        .header('Cache-Control', 'private, max-age=86400')
        .send(storage.streamOf(photo.thumbKey))
    },
  )

  /** Image affichee dans la visionneuse. */
  app.get<{ Params: { photoId: string } }>(
    '/api/photos/:photoId/file',
    async (request, reply) => {
      const { photo, allowed } = await loadAuthorizedPhoto(request, request.params.photoId)
      if (!photo) return reply.code(404).send({ error: 'not_found' })
      if (!allowed) return reply.code(403).send({ error: 'forbidden' })

      // Un RAW n'est affichable par aucun navigateur : on montre l'apercu
      // extrait du fichier a l'import, jamais l'original.
      const displayKey = photo.previewKey ?? photo.storageKey
      const displayType = photo.previewKey ? 'image/jpeg' : photo.mimeType

      // Atelier de stories : version sans filigrane, ramenee a une taille
      // exploitable. L'original peut peser une dizaine de megaoctets, pour
      // etre dessine ensuite sur 1080 pixels de large.
      if (await wantsOriginal(request)) {
        const cacheKey = storage.renditionKey(photo.galleryId, photo.id)
        if (!(await storage.exists(cacheKey))) {
          if (!(await storage.exists(displayKey))) {
            return reply.code(404).send({ error: 'not_found' })
          }
          await storage.put(cacheKey, await rendition(await storage.readBuffer(displayKey)))
        }
        return reply
          .header('Content-Type', 'image/jpeg')
          .header('Cache-Control', 'private, max-age=86400')
          .send(storage.streamOf(cacheKey))
      }

      if (photo.gallery.limitedSelection) {
        // Definition bornee : une capture d'ecran ne vaudra rien en tirage.
        const body = await watermarkedBuffer(
          photo.galleryId,
          photo.id,
          displayKey,
          PREVIEW_WIDTH,
          'preview',
        )
        return reply
          .header('Content-Type', 'image/webp')
          .header('Cache-Control', 'private, max-age=86400')
          .send(body)
      }

      if (!(await storage.exists(displayKey))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return reply
        .header('Content-Type', displayType)
        .header('Cache-Control', 'private, max-age=86400')
        .send(storage.streamOf(displayKey))
    },
  )

  /**
   * Enregistre le telechargement, sauf s'il vient de la photographe.
   * Elle previsualise ses propres galeries : ses essais ne doivent pas
   * ressembler a une cliente qui a recupere ses photos.
   */
  async function trackDownload(request: FastifyRequest, galleryId: string): Promise<void> {
    if (await readSession(request)) return
    await noteDownloaded(galleryId)
  }

  /**
   * Le demandeur a-t-il le droit d'emporter ce fichier ?
   * Sur une galerie limitee : seulement apres validation de la selection, et
   * seulement pour les photos qui en font partie.
   */
  async function downloadRefusal(
    request: FastifyRequest,
    gallery: {
      id: string
      downloadEnabled: boolean
      limitedSelection: boolean
      imageConsentRequested: boolean
    },
    photoId?: string,
  ): Promise<string | null> {
    if (!gallery.downloadEnabled) return 'download_disabled'

    // La photographe previsualise ses propres galeries sans restriction.
    if (await readSession(request)) return null

    /*
     * Droit a l'image : une reponse est exigee avant de telecharger.
     *
     * Une REPONSE, pas un accord. « Non » ouvre le telechargement comme
     * « oui ». Conditionner la remise des photos a l'acceptation rendrait le
     * consentement non libre, donc sans valeur : ce serait perdre ce qu'on
     * cherche justement a obtenir.
     */
    if (gallery.imageConsentRequested) {
      const answered = await prisma.imageConsent.findFirst({
        where: { galleryId: gallery.id },
        select: { id: true },
      })
      if (!answered) return 'consent_required'
    }

    if (!gallery.limitedSelection) return null

    const client = await readClient(request)
    if (!client) return 'forbidden'

    // La selection appartient a la galerie : celui qui telecharge n'est pas
    // forcement celui qui a choisi, et c'est voulu.
    const validated = await prisma.selection.findUnique({
      where: { galleryId: gallery.id },
    })
    if (!validated) return 'selection_not_validated'

    if (photoId) {
      const chosen = await prisma.favorite.findUnique({ where: { photoId } })
      if (!chosen) return 'not_in_selection'
    }
    return null
  }

  /** Telechargement d'une photo. */
  app.get<{ Params: { photoId: string } }>(
    '/api/photos/:photoId/download',
    async (request, reply) => {
      const { photo, allowed } = await loadAuthorizedPhoto(request, request.params.photoId)
      if (!photo) return reply.code(404).send({ error: 'not_found' })
      if (!allowed) return reply.code(403).send({ error: 'forbidden' })

      const refusal = await downloadRefusal(request, photo.gallery, photo.id)
      if (refusal) return reply.code(403).send({ error: refusal })

      // Photo par photo compte aussi : ce qui interesse la photographe, c'est
      // que sa cliente soit repartie avec ses images, pas la maniere.
      await trackDownload(request, photo.galleryId)

      return reply
        .header('Content-Type', photo.mimeType)
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(photo.originalName)}`,
        )
        .send(storage.streamOf(photo.storageKey))
    },
  )

  /**
   * Archive zip de la galerie, ou de la seule selection du visiteur.
   * Le zip est diffuse au fil de l'eau : rien n'est assemble en memoire, une
   * galerie de plusieurs gigaoctets passe sans faire enfler le serveur.
   */
  app.get<{ Params: { code: string }; Querystring: { only?: string } }>(
    '/api/client/gallery/:code/archive',
    async (request, reply) => {
      const gallery = await prisma.gallery.findUnique({
        where: { code: request.params.code.toUpperCase() },
        include: { photos: { orderBy: { position: 'asc' } } },
      })
      if (!gallery) return reply.code(404).send({ error: 'not_found' })

      const allowed = await canReadGallery(request, gallery)
      if (!allowed) return reply.code(403).send({ error: 'forbidden' })

      const refusal = await downloadRefusal(request, gallery)
      if (refusal) return reply.code(403).send({ error: refusal })

      let photos = gallery.photos

      // Sur une galerie limitee, l'archive ne contient jamais que la selection,
      // quoi que demande la requete.
      const onlyFavorites = gallery.limitedSelection || request.query.only === 'favorites'

      if (onlyFavorites) {
        const favorites = await prisma.favorite.findMany({
          where: { galleryId: gallery.id },
          select: { photoId: true },
        })
        const keep = new Set(favorites.map((f) => f.photoId))
        photos = photos.filter((p) => keep.has(p.id))
      }

      if (photos.length === 0) {
        return reply.code(404).send({ error: 'empty_selection' })
      }

      await trackDownload(request, gallery.id)

      const safeName = gallery.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'galerie'

      // Niveau 1 : les JPEG sont deja compresses, pousser plus haut coute du
      // CPU pour quelques pourcents.
      const archive = new ZipArchive({ zlib: { level: 1 } })

      reply
        .header('Content-Type', 'application/zip')
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.zip`,
        )

      archive.on('warning', (err: unknown) => request.log.warn({ err }, 'archive'))
      archive.on('error', (err: unknown) => {
        request.log.error({ err }, 'archive interrompue')
        reply.raw.destroy()
      })

      for (const photo of photos) {
        if (await storage.exists(photo.storageKey)) {
          archive.append(storage.streamOf(photo.storageKey), { name: photo.originalName })
        }
      }
      void archive.finalize()

      return reply.send(archive)
    },
  )
}
