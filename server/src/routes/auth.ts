import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import {
  clearSession,
  issueSession,
  readSession,
  verifyPassword,
} from '../auth.js'

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', {
    // Frein contre le bourrage d'identifiants.
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    handler: async (request, reply) => {
      const parsed = credentials.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body' })
      }

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email.toLowerCase().trim() },
      })

      // Meme reponse que le mot de passe soit faux ou le compte inexistant :
      // sinon l'API dit quelles adresses existent.
      const ok = user
        ? await verifyPassword(parsed.data.password, user.passwordHash)
        : false

      if (!user || !ok) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      await issueSession(reply, user)
      return reply.send({ user: { id: user.id, email: user.email, name: user.name } })
    },
  })

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSession(reply)
    return reply.send({ ok: true })
  })

  app.get('/api/auth/me', async (request, reply) => {
    const session = await readSession(request)
    if (!session) return reply.code(401).send({ error: 'unauthorized' })

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, email: true, name: true },
    })
    if (!user) return reply.code(401).send({ error: 'unauthorized' })

    return reply.send({ user })
  })
}
