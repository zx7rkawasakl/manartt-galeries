import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireUser } from '../auth.js'

/**
 * Tirage au sort d'un concours.
 *
 * Le serveur ne stocke que la liste des participants : le tirage lui-meme se
 * fait dans le navigateur, ou vit l'animation de revelation.
 */

const listBody = z.object({
  participants: z
    .array(
      z.object({
        handle: z.string().trim().min(1).max(120),
        entries: z.number().int().min(1).max(10_000),
      }),
    )
    .max(20_000),
})

export default async function contestRoutes(app: FastifyInstance) {
  app.get('/api/contest/participants', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const participants = await prisma.participant.findMany({
      where: { ownerId: session.sub },
      select: { handle: true, entries: true },
      orderBy: [{ entries: 'desc' }, { handle: 'asc' }],
    })
    return reply.send({ participants })
  })

  /** Remplace toute la liste d'un coup (c'est ce que fait le collage). */
  app.put('/api/contest/participants', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    const parsed = listBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        message: parsed.error.issues[0]?.message ?? 'Liste invalide',
      })
    }

    // Fusionne les doublons de pseudo : la contrainte d'unicite les refuserait,
    // et un meme pseudo colle deux fois veut dire deux participations.
    const merged = new Map<string, number>()
    for (const entry of parsed.data.participants) {
      const handle = entry.handle.replace(/^@+/, '').trim()
      if (!handle) continue
      merged.set(handle, (merged.get(handle) ?? 0) + entry.entries)
    }

    await prisma.$transaction([
      prisma.participant.deleteMany({ where: { ownerId: session.sub } }),
      prisma.participant.createMany({
        data: [...merged].map(([handle, entries]) => ({
          ownerId: session.sub,
          handle,
          entries,
        })),
      }),
    ])

    const participants = await prisma.participant.findMany({
      where: { ownerId: session.sub },
      select: { handle: true, entries: true },
      orderBy: [{ entries: 'desc' }, { handle: 'asc' }],
    })
    return reply.send({ participants })
  })

  app.delete('/api/contest/participants', async (request, reply) => {
    const session = await requireUser(request, reply)
    if (!session) return

    await prisma.participant.deleteMany({ where: { ownerId: session.sub } })
    return reply.send({ participants: [] })
  })
}
