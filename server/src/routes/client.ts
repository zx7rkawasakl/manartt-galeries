import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import {
  grantGalleryAccess,
  isGalleryClosed,
  readClient,
  readSession,
} from '../auth.js'
import { galleryDto } from '../serialize.js'
import { noteOpened } from '../tracking.js'
import { TERMS_TEXT, TERMS_VERSION, terms } from '../consent.js'

const withPhotos = { photos: { orderBy: { position: 'asc' } } } as const

/**
 * Enregistre la visite, sauf si c'est la photographe.
 *
 * Elle a son propre chemin d'apercu, mais si elle se deconnecte et ouvre le
 * lien comme tout le monde, son passage ne doit pas se faire passer pour
 * celui de sa cliente.
 */
async function trackOpen(request: FastifyRequest, galleryId: string): Promise<void> {
  if (await readSession(request)) return
  await noteOpened(galleryId)
}

/**
 * Routes du parcours client. Aucune authentification par compte : l'entree
 * se fait par le code de la galerie.
 */
export default async function clientRoutes(app: FastifyInstance) {
  /** Saisie du code. Accorde l'acces et pose le cookie de visite. */
  app.post('/api/client/access', {
    // Un code fait 8 caracteres : sans frein, il serait devinable en force brute.
    config: { rateLimit: { max: 20, timeWindow: '5 minutes' } },
    handler: async (request, reply) => {
      const parsed = z.object({ code: z.string().trim().min(1) }).safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'not_found' })

      const gallery = await prisma.gallery.findUnique({
        where: { code: parsed.data.code.toUpperCase() },
        include: withPhotos,
      })

      // Une galerie non publiee est traitee comme inexistante : la reponse ne
      // doit pas reveler qu'un code valide existe mais n'est pas encore ouvert.
      if (!gallery || !gallery.published) {
        return reply.code(404).send({ error: 'not_found' })
      }
      if (gallery.expiresAt && gallery.expiresAt < new Date()) {
        return reply.code(410).send({ error: 'expired' })
      }

      await grantGalleryAccess(request, reply, gallery.id)
      await trackOpen(request, gallery.id)
      return reply.send({ gallery: galleryDto(gallery) })
    },
  })

  /** Relecture apres rechargement de la page, sur la foi du cookie. */
  app.get<{ Params: { code: string } }>(
    '/api/client/gallery/:code',
    async (request, reply) => {
      const gallery = await prisma.gallery.findUnique({
        where: { code: request.params.code.toUpperCase() },
        include: withPhotos,
      })
      if (!gallery || !gallery.published) {
        return reply.code(404).send({ error: 'not_found' })
      }
      if (gallery.expiresAt && gallery.expiresAt < new Date()) {
        return reply.code(410).send({ error: 'expired' })
      }

      const client = await readClient(request)
      if (!client?.galleries.includes(gallery.id)) {
        // Le cookie a expire ou n'a jamais existe : il faut ressaisir le code.
        return reply.code(403).send({ error: 'not_found' })
      }

      await trackOpen(request, gallery.id)
      return reply.send({ gallery: galleryDto(gallery) })
    },
  )

  /**
   * Etat de la selection de la galerie.
   *
   * Elle est commune a tous ceux qui ont le code : un couple qui choisit a
   * deux, sur deux ecrans, voit la meme liste.
   */
  async function selectionState(galleryId: string) {
    const [favorites, validated] = await Promise.all([
      prisma.favorite.findMany({ where: { galleryId }, select: { photoId: true } }),
      prisma.selection.findUnique({ where: { galleryId } }),
    ])
    return {
      favorites: favorites.map((f) => f.photoId),
      validated: validated !== null,
    }
  }

  app.get<{ Params: { code: string } }>(
    '/api/client/gallery/:code/favorites',
    async (request, reply) => {
      const empty = { favorites: [], validated: false }

      const client = await readClient(request)
      if (!client) return reply.send(empty)

      const gallery = await prisma.gallery.findUnique({
        where: { code: request.params.code.toUpperCase() },
        select: { id: true, published: true, expiresAt: true },
      })
      if (!gallery || isGalleryClosed(gallery) || !client.galleries.includes(gallery.id)) {
        return reply.send(empty)
      }

      return reply.send(await selectionState(gallery.id))
    },
  )

  /* ------------------- Autorisation de diffusion ------------------- */

  /** Galerie accessible au visiteur courant, ou null. */
  async function authorizedGallery(request: FastifyRequest, code: string) {
    const gallery = await prisma.gallery.findUnique({
      where: { code: code.toUpperCase() },
      select: {
        id: true,
        imageConsentRequested: true,
        published: true,
        expiresAt: true,
      },
    })
    // Une galerie fermee ne repond plus a personne, cookie ou pas : celui-ci
    // vaut trente jours et survivrait a l'expiration.
    if (!gallery || isGalleryClosed(gallery)) return null

    const client = await readClient(request)
    if (!client?.galleries.includes(gallery.id)) return null

    return { gallery, client }
  }

  /** Derniere reponse en date : c'est elle qui fait foi. */
  async function currentConsent(galleryId: string) {
    return prisma.imageConsent.findFirst({
      where: { galleryId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** Le texte a lire, et la reponse deja donnee le cas echeant. */
  app.get<{ Params: { code: string } }>(
    '/api/client/gallery/:code/consent',
    async (request, reply) => {
      const found = await authorizedGallery(request, request.params.code)
      if (!found) return reply.code(403).send({ error: 'unauthorized' })

      const answer = await currentConsent(found.gallery.id)

      return reply.send({
        requested: found.gallery.imageConsentRequested,
        terms: terms(),
        answer: answer
          ? {
              granted: answer.granted,
              signerName: answer.signerName,
              notes: answer.notes,
              decidedAt: answer.createdAt.toISOString(),
            }
          : null,
      })
    },
  )

  /**
   * Reponse du client.
   *
   * Chaque reponse est ajoutee au journal plutot que de remplacer la
   * precedente : un accord retire doit rester visible comme ayant existe.
   */
  app.post<{ Params: { code: string } }>(
    '/api/client/gallery/:code/consent',
    async (request, reply) => {
      const parsed = z
        .object({
          granted: z.boolean(),
          signerName: z.string().trim().min(2, 'Indiquez votre nom.').max(120),
          notes: z.string().trim().max(1000).default(''),
        })
        .safeParse(request.body)

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          message: parsed.error.issues[0]?.message ?? 'Données invalides',
        })
      }

      const found = await authorizedGallery(request, request.params.code)
      if (!found) return reply.code(403).send({ error: 'unauthorized' })
      if (!found.gallery.imageConsentRequested) {
        return reply.code(400).send({ error: 'not_requested' })
      }

      const answer = await prisma.imageConsent.create({
        data: {
          galleryId: found.gallery.id,
          granted: parsed.data.granted,
          signerName: parsed.data.signerName,
          notes: parsed.data.notes,
          // Le texte affiche au moment de la reponse, fige avec elle.
          termsVersion: TERMS_VERSION,
          termsText: TERMS_TEXT,
          visitorId: found.client.visitorId,
        },
      })

      return reply.send({
        answer: {
          granted: answer.granted,
          signerName: answer.signerName,
          notes: answer.notes,
          decidedAt: answer.createdAt.toISOString(),
        },
      })
    },
  )

  /**
   * Fige la selection. Irreversible cote client : c'est ce qui empeche de
   * telecharger un lot, de changer d'avis, et de repartir avec toute la galerie.
   */
  app.post<{ Params: { code: string } }>(
    '/api/client/gallery/:code/validate',
    async (request, reply) => {
      const client = await readClient(request)
      if (!client) return reply.code(403).send({ error: 'unauthorized' })

      const gallery = await prisma.gallery.findUnique({
        where: { code: request.params.code.toUpperCase() },
        select: {
          id: true,
          limitedSelection: true,
          selectionLimit: true,
          published: true,
          expiresAt: true,
        },
      })
      if (!gallery || isGalleryClosed(gallery) || !client.galleries.includes(gallery.id)) {
        return reply.code(403).send({ error: 'unauthorized' })
      }
      if (!gallery.limitedSelection) {
        return reply.code(400).send({ error: 'not_limited' })
      }

      const count = await prisma.favorite.count({ where: { galleryId: gallery.id } })

      // Le compte exact est exige : ni plus, ni moins.
      if (count !== gallery.selectionLimit) {
        return reply.code(409).send({
          error: 'incomplete_selection',
          message: `Choisissez exactement ${gallery.selectionLimit} photo${gallery.selectionLimit > 1 ? 's' : ''}.`,
          selected: count,
          limit: gallery.selectionLimit,
        })
      }

      // Une seule validation par galerie. Si l'autre ecran a valide entre-temps,
      // on ne cree pas de doublon et le resultat est le meme.
      await prisma.selection.upsert({
        where: { galleryId: gallery.id },
        create: { galleryId: gallery.id, visitorId: client.visitorId },
        update: {},
      })

      return reply.send({ validated: true })
    },
  )

  /** Ajoute ou retire une photo de la selection. */
  app.put<{ Params: { photoId: string } }>(
    '/api/client/favorites/:photoId',
    async (request, reply) => {
      const parsed = z.object({ favorite: z.boolean() }).safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' })

      const client = await readClient(request)
      if (!client) return reply.code(403).send({ error: 'unauthorized' })

      const photo = await prisma.photo.findUnique({
        where: { id: request.params.photoId },
        select: { id: true, galleryId: true, gallery: true },
      })
      if (
        !photo ||
        isGalleryClosed(photo.gallery) ||
        !client.galleries.includes(photo.galleryId)
      ) {
        return reply.code(403).send({ error: 'unauthorized' })
      }

      if (photo.gallery.limitedSelection) {
        const [validated, count] = await Promise.all([
          prisma.selection.findUnique({ where: { galleryId: photo.galleryId } }),
          prisma.favorite.count({ where: { galleryId: photo.galleryId } }),
        ])

        // Une fois la selection validee, elle ne bouge plus.
        if (validated) {
          return reply.code(409).send({
            error: 'selection_locked',
            message: 'La sélection a été validée, elle ne peut plus être modifiée.',
          })
        }

        // Le plafond est tenu par le serveur : le client ne doit pas pouvoir
        // depasser son forfait en contournant l'interface, ni en rouvrant le
        // lien sur un autre appareil.
        const already = await prisma.favorite.findUnique({ where: { photoId: photo.id } })
        if (parsed.data.favorite && !already && count >= photo.gallery.selectionLimit) {
          return reply.code(409).send({
            error: 'selection_full',
            message: `La sélection est complète (${photo.gallery.selectionLimit} photos). Retirez-en une pour en choisir une autre.`,
          })
        }
      }

      if (parsed.data.favorite) {
        await prisma.favorite.upsert({
          where: { photoId: photo.id },
          create: {
            photoId: photo.id,
            galleryId: photo.galleryId,
            visitorId: client.visitorId,
          },
          update: {},
        })
      } else {
        await prisma.favorite.deleteMany({ where: { photoId: photo.id } })
      }

      // On renvoie l'etat reel de la selection : l'ecran d'en face a pu bouger
      // entre-temps, et c'est le seul moyen de le voir sans interroger en boucle.
      return reply.send(await selectionState(photo.galleryId))
    },
  )
}
