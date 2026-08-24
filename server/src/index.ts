import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'

import { env, isProduction } from './env.js'
import { disconnect, prisma } from './db.js'
import * as storage from './storage.js'
import authRoutes from './routes/auth.js'
import galleryRoutes from './routes/galleries.js'
import clientRoutes from './routes/client.js'
import fileRoutes from './routes/files.js'
import contestRoutes from './routes/contest.js'
import storageRoutes from './routes/storage.js'

const app = Fastify({
  logger: isProduction
    ? true
    : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
  // Les originaux peuvent etre lourds ; la limite fine est posee par multipart.
  bodyLimit: 2 * 1024 * 1024,
  /*
   * En production, l'API vit derriere nginx : toutes les requetes lui
   * arrivent de 127.0.0.1. Sans ce reglage, le limiteur de debit ne voit
   * qu'un seul visiteur — une cliente qui se trompe vingt fois de code
   * bloquerait toutes les autres, et dix tentatives de connexion ratees
   * verrouilleraient la photographe.
   *
   * `loopback` et non `true` : seul le proxy local est cru quand il annonce
   * l'adresse du visiteur. Autrement, n'importe qui pourrait s'inventer une
   * adresse et contourner le frein.
   */
  trustProxy: isProduction ? 'loopback' : false,
})

/*
 * Le gestionnaire d'erreurs est pose ICI, avant tout le reste.
 *
 * Ce n'est pas cosmetique : les `await app.register(...)` qui suivent
 * amorcent l'arbre des plugins. Pose apres eux, ce gestionnaire n'etait
 * jamais appele, et Fastify renvoyait ses messages par defaut — chemins de
 * fichiers et erreurs de base de donnees compris — directement au client.
 */
app.setErrorHandler((error: unknown, request, reply) => {
  request.log.error({ err: error }, 'requete en echec')

  const details = (error ?? {}) as { statusCode?: unknown; code?: unknown }
  const status = typeof details.statusCode === 'number' ? details.statusCode : 500

  if (status === 429) {
    return reply.code(429).send({
      error: 'too_many_requests',
      message: 'Trop de tentatives. Patientez quelques minutes.',
    })
  }
  if (details.code === 'FST_REQ_FILE_TOO_LARGE') {
    return reply.code(413).send({ error: 'file_too_large' })
  }

  // Aucun detail interne ne remonte au client.
  return reply.code(status).send({ error: 'server_error' })
})

await app.register(cookie)

await app.register(cors, {
  origin: env.CLIENT_ORIGIN,
  // Indispensable : toute l'authentification passe par des cookies.
  credentials: true,
})

await app.register(rateLimit, {
  global: false,
  max: 300,
  timeWindow: '1 minute',
})

await app.register(multipart, {
  limits: {
    fileSize: 80 * 1024 * 1024, // 80 Mo par photo
    files: 300,
  },
})

app.get('/api/health', async () => {
  await prisma.$queryRaw`SELECT 1`
  return { ok: true }
})

await app.register(authRoutes)
await app.register(galleryRoutes)
await app.register(clientRoutes)
await app.register(fileRoutes)
await app.register(contestRoutes)
await app.register(storageRoutes)

async function start() {
  await storage.ensureReady()
  await app.listen({
    port: env.PORT,
    /*
     * En production, nginx est la seule porte d'entree : l'API n'ecoute que
     * sur la boucle locale. C'est ce qui rend `trustProxy` sur : personne ne
     * peut lui parler directement pour s'annoncer sous une fausse adresse.
     */
    host: isProduction ? '127.0.0.1' : '0.0.0.0',
  })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    await disconnect()
    process.exit(0)
  })
}

start().catch((error) => {
  app.log.error({ err: error }, 'demarrage impossible')
  process.exit(1)
})
