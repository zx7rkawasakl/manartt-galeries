import type { FastifyInstance } from 'fastify'
import { requireUser } from '../auth.js'
import { env } from '../env.js'
import * as storage from '../storage.js'

/**
 * Occupation du disque.
 *
 * Le but n'est pas la comptabilite, c'est d'eviter la seule panne qui ne
 * previent pas : un import qui echoue parce qu'il n'y a plus de place.
 */
export default async function storageRoutes(app: FastifyInstance) {
  app.get('/api/storage', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const { bytes, files, byGallery } = await storage.usage()
    const quotaBytes = env.STORAGE_QUOTA_GB * 1024 ** 3
    const poids = Object.values(byGallery)

    return reply.send({
      usedBytes: bytes,
      quotaBytes,
      files,
      galleryCount: poids.length,
      /**
       * La plus grosse galerie sert d'etalon pour estimer ce qui reste.
       * Une moyenne serait trompeuse : elle est tiree vers le bas par les
       * galeries a deux photos, et annoncerait de la place qui n'existe pas
       * pour une vraie seance.
       */
      largestGalleryBytes: poids.length > 0 ? Math.max(...poids) : 0,
    })
  })
}
