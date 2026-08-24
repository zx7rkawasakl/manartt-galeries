import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireUser } from '../auth.js'
import { galleryAdminDto } from '../serialize.js'
import * as storage from '../storage.js'
import { isAccepted, process as processImage } from '../images.js'

/**
 * Ce que la photographe voit d'une galerie : ses photos, l'etat de la
 * selection du client, et de quoi savoir ou en est la livraison.
 */
const withPhotos = {
  photos: { orderBy: { position: 'asc' } },
  selection: true,
  // Seule la derniere reponse compte : c'est l'etat courant de l'autorisation.
  imageConsents: { orderBy: { createdAt: 'desc' }, take: 1 },
  _count: { select: { favorites: true } },
} as const

const codeRule = z
  .string()
  .trim()
  .min(4)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/, 'Le code ne peut contenir que lettres, chiffres et tirets')

const createBody = z.object({
  title: z.string().trim().min(1, 'Le nom est obligatoire').max(160),
  clientName: z.string().trim().max(160).default(''),
  code: codeRule,
  shotAt: z.string(),
  expiresAt: z.string().nullable().default(null),
  downloadEnabled: z.boolean().default(true),
  published: z.boolean().default(false),
  limitedSelection: z.boolean().default(false),
  selectionLimit: z.number().int().min(1).max(500).default(10),
  imageConsentRequested: z.boolean().default(true),
})

/**
 * Schema de mise a jour, redefini champ par champ plutot que par
 * `createBody.partial()`.
 *
 * `.partial()` rend bien les champs optionnels, mais il CONSERVE les
 * `.default()`. Une modification du seul titre reinjectait donc
 * `published: false`, `clientName: ''` et `expiresAt: null` : la galerie se
 * depubliait toute seule et le client se voyait refuser son code.
 * Ici, un champ absent reste absent.
 */
const updateBody = z.object({
  title: z.string().trim().min(1, 'Le nom est obligatoire').max(160).optional(),
  clientName: z.string().trim().max(160).optional(),
  code: codeRule.optional(),
  shotAt: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
  downloadEnabled: z.boolean().optional(),
  published: z.boolean().optional(),
  limitedSelection: z.boolean().optional(),
  selectionLimit: z.number().int().min(1).max(500).optional(),
  imageConsentRequested: z.boolean().optional(),
})

/** yyyy-mm-dd -> Date en UTC, pour eviter les decalages de fuseau. */
function toDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

export default async function galleryRoutes(app: FastifyInstance) {
  /* ----------------------------- Lecture ---------------------------- */

  app.get('/api/galleries', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const galleries = await prisma.gallery.findMany({
      where: { ownerId: session.sub },
      include: withPhotos,
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ galleries: galleries.map((g) => galleryAdminDto(g)) })
  })

  app.get<{ Params: { id: string } }>('/api/galleries/:id', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const gallery = await prisma.gallery.findFirst({
      where: { id: request.params.id, ownerId: session.sub },
      include: withPhotos,
    })
    if (!gallery) return reply.code(404).send({ error: 'not_found' })

    return reply.send({ gallery: galleryAdminDto(gallery) })
  })

  /**
   * Lecture par code, reservee a la photographe.
   *
   * C'est ce qui alimente l'apercu client : elle voit sa galerie sans passer
   * par `/api/client/access`, qui lui poserait un cookie de visiteur et la
   * ferait compter comme une cliente parmi les autres.
   *
   * Contrairement au parcours client, ni la publication ni l'expiration ne
   * sont exigees : previsualiser avant de publier est justement le but.
   */
  app.get<{ Params: { code: string } }>(
    '/api/galleries/by-code/:code',
    async (request, reply) => {
      const session = await requireUser(request, reply)
      if (!session) return

      const gallery = await prisma.gallery.findFirst({
        where: { code: request.params.code.toUpperCase(), ownerId: session.sub },
        include: withPhotos,
      })
      if (!gallery) return reply.code(404).send({ error: 'not_found' })

      return reply.send({ gallery: galleryAdminDto(gallery) })
    },
  )

  /* ---------------------------- Ecriture ---------------------------- */

  app.post('/api/galleries', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const parsed = createBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        message: parsed.error.issues[0]?.message ?? 'Données invalides',
      })
    }

    const code = parsed.data.code.toUpperCase()
    const clash = await prisma.gallery.findUnique({ where: { code } })
    if (clash) {
      return reply.code(409).send({
        error: 'code_taken',
        message: 'Ce code est déjà utilisé par une autre galerie.',
      })
    }

    const gallery = await prisma.gallery.create({
      data: {
        code,
        title: parsed.data.title,
        clientName: parsed.data.clientName,
        shotAt: toDate(parsed.data.shotAt),
        expiresAt: parsed.data.expiresAt ? toDate(parsed.data.expiresAt) : null,
        downloadEnabled: parsed.data.downloadEnabled,
        published: parsed.data.published,
        limitedSelection: parsed.data.limitedSelection,
        selectionLimit: parsed.data.selectionLimit,
        imageConsentRequested: parsed.data.imageConsentRequested,
        ownerId: session.sub,
      },
      include: withPhotos,
    })

    return reply.code(201).send({ gallery: galleryAdminDto(gallery) })
  })

  app.patch<{ Params: { id: string } }>('/api/galleries/:id', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const parsed = updateBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        message: parsed.error.issues[0]?.message ?? 'Données invalides',
      })
    }

    const existing = await prisma.gallery.findFirst({
      where: { id: request.params.id, ownerId: session.sub },
    })
    if (!existing) return reply.code(404).send({ error: 'not_found' })

    const data = parsed.data
    const code = data.code ? data.code.toUpperCase() : undefined

    if (code && code !== existing.code) {
      const clash = await prisma.gallery.findUnique({ where: { code } })
      if (clash) {
        return reply.code(409).send({
          error: 'code_taken',
          message: 'Ce code est déjà utilisé par une autre galerie.',
        })
      }
    }

    const gallery = await prisma.gallery.update({
      where: { id: existing.id },
      data: {
        ...(code ? { code } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.clientName !== undefined ? { clientName: data.clientName } : {}),
        ...(data.shotAt !== undefined ? { shotAt: toDate(data.shotAt) } : {}),
        ...(data.expiresAt !== undefined
          ? { expiresAt: data.expiresAt ? toDate(data.expiresAt) : null }
          : {}),
        ...(data.downloadEnabled !== undefined
          ? { downloadEnabled: data.downloadEnabled }
          : {}),
        ...(data.published !== undefined ? { published: data.published } : {}),
        ...(data.limitedSelection !== undefined
          ? { limitedSelection: data.limitedSelection }
          : {}),
        ...(data.selectionLimit !== undefined
          ? { selectionLimit: data.selectionLimit }
          : {}),
        ...(data.imageConsentRequested !== undefined
          ? { imageConsentRequested: data.imageConsentRequested }
          : {}),
      },
      include: withPhotos,
    })

    // L'option « galerie limitee » vient de changer : le cache de filigrane
    // ne represente plus ce que la galerie doit montrer. Le jeton de version
    // des URL (voir serialize.ts) s'occupe du cache des navigateurs ; ici on
    // s'occupe de celui du disque.
    if (
      data.limitedSelection !== undefined &&
      data.limitedSelection !== existing.limitedSelection
    ) {
      await storage.removeWatermarkCache(gallery.id)

      // Repasser en galerie complete leve la contrainte : les selections
      // figees n'ont plus de sens, et laisser le verrou empecherait le client
      // de toucher a ses coups de coeur.
      if (!data.limitedSelection) {
        await prisma.selection.deleteMany({ where: { galleryId: gallery.id } })
      }
    }

    return reply.send({ gallery: galleryAdminDto(gallery) })
  })

  app.delete<{ Params: { id: string } }>('/api/galleries/:id', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const gallery = await prisma.gallery.findFirst({
      where: { id: request.params.id, ownerId: session.sub },
    })
    if (!gallery) return reply.code(404).send({ error: 'not_found' })

    // Les photos et favoris partent en cascade ; les fichiers, eux, doivent
    // etre effaces explicitement sinon ils restent orphelins sur le disque.
    await prisma.gallery.delete({ where: { id: gallery.id } })
    await storage.removeGallery(gallery.id)

    return reply.send({ ok: true })
  })

  /* --------------------------- Import photos ------------------------ */

  app.post<{ Params: { id: string } }>(
    '/api/galleries/:id/photos',
    async (request, reply) => {
      const session = await requireUser(request, reply)
      if (!session) return

      const gallery = await prisma.gallery.findFirst({
        where: { id: request.params.id, ownerId: session.sub },
      })
      if (!gallery) return reply.code(404).send({ error: 'not_found' })

      const last = await prisma.photo.findFirst({
        where: { galleryId: gallery.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      let position = (last?.position ?? -1) + 1

      const failed: string[] = []
      let imported = 0

      for await (const part of request.files()) {
        const filename = part.filename || 'sans-nom'

        if (!isAccepted(part.mimetype, filename)) {
          failed.push(filename)
          // Le flux doit etre consomme, sinon la lecture des parties suivantes bloque.
          await part.toBuffer().catch(() => undefined)
          continue
        }

        try {
          const buffer = await part.toBuffer()
          const { width, height, thumbnail, preview } = await processImage(buffer, filename)

          const photoId = crypto.randomUUID()
          const ext = path.extname(filename).toLowerCase() || '.jpg'
          const keys = storage.keysFor(gallery.id, photoId, ext)

          await storage.put(keys.storageKey, buffer)
          await storage.put(keys.thumbKey, thumbnail)
          // Les RAW ne s'affichent pas : on range a cote l'apercu extrait du fichier.
          if (preview) await storage.put(keys.previewKey, preview)

          await prisma.photo.create({
            data: {
              id: photoId,
              galleryId: gallery.id,
              originalName: filename,
              storageKey: keys.storageKey,
              thumbKey: keys.thumbKey,
              previewKey: preview ? keys.previewKey : null,
              mimeType: part.mimetype,
              width,
              height,
              bytes: buffer.byteLength,
              position: position++,
            },
          })
          imported += 1
        } catch (error) {
          request.log.error({ error, filename }, 'import impossible')
          failed.push(filename)
        }
      }

      const updated = await prisma.gallery.findUniqueOrThrow({
        where: { id: gallery.id },
        include: withPhotos,
      })

      return reply.send({ gallery: galleryAdminDto(updated), imported, failed })
    },
  )

  app.delete<{ Params: { id: string; photoId: string } }>(
    '/api/galleries/:id/photos/:photoId',
    async (request, reply) => {
      const session = await requireUser(request, reply)
      if (!session) return

      const photo = await prisma.photo.findFirst({
        where: {
          id: request.params.photoId,
          galleryId: request.params.id,
          gallery: { ownerId: session.sub },
        },
      })
      if (!photo) return reply.code(404).send({ error: 'not_found' })

      await prisma.photo.delete({ where: { id: photo.id } })
      await Promise.all(
        [
          photo.storageKey,
          photo.thumbKey,
          photo.previewKey,
          // Les caches aussi : sans ca ils survivent a la photo et
          // s'accumulent silencieusement sur le disque.
          ...storage.watermarkKeys(photo.galleryId, photo.id),
          storage.renditionKey(photo.galleryId, photo.id),
        ]
          .filter((key): key is string => Boolean(key))
          .map((key) => storage.remove(key)),
      )

      const updated = await prisma.gallery.findUniqueOrThrow({
        where: { id: request.params.id },
        include: withPhotos,
      })
      return reply.send({ gallery: galleryAdminDto(updated) })
    },
  )
}
