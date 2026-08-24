import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env, isProduction } from './env.js'

const key = new TextEncoder().encode(env.AUTH_SECRET)

export const SESSION_COOKIE = 'manartt_session'
export const CLIENT_COOKIE = 'manartt_client'

/* --------------------------- Mots de passe ------------------------- */

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/* ------------------------------ Jetons ----------------------------- */

async function sign(payload: Record<string, unknown>, expiresIn: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)
}

async function verify<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, key)
    return payload as T
  } catch {
    return null
  }
}

/* ------------------------ Session photographe ---------------------- */

type SessionPayload = { sub: string; email: string }

export async function issueSession(reply: FastifyReply, user: { id: string; email: string }) {
  const token = await sign({ sub: user.id, email: user.email }, '7d')
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export async function readSession(request: FastifyRequest): Promise<SessionPayload | null> {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null
  return verify<SessionPayload>(token)
}

/**
 * Garde des routes photographe. Repond 401 et interrompt si la session
 * est absente ou invalide.
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionPayload | null> {
  const session = await readSession(request)
  if (!session) {
    await reply.code(401).send({ error: 'unauthorized' })
    return null
  }
  return session
}

/* --------------------------- Acces client -------------------------- */

/**
 * Le client n'a pas de compte. Apres avoir saisi un code valide il recoit ce
 * jeton, qui liste les galeries qu'il a le droit de consulter et porte un
 * identifiant de visite stable (pour rattacher ses favoris).
 */
type ClientPayload = { visitorId: string; galleries: string[] }

export async function readClient(request: FastifyRequest): Promise<ClientPayload | null> {
  const token = request.cookies[CLIENT_COOKIE]
  if (!token) return null
  const payload = await verify<ClientPayload>(token)
  if (!payload || !Array.isArray(payload.galleries)) return null
  return payload
}

/** Ajoute une galerie aux droits du visiteur et rafraichit son cookie. */
export async function grantGalleryAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  galleryId: string,
): Promise<ClientPayload> {
  const existing = await readClient(request)
  const visitorId = existing?.visitorId ?? randomUUID()
  const galleries = [...new Set([...(existing?.galleries ?? []), galleryId])]

  const token = await sign({ visitorId, galleries }, '30d')
  reply.setCookie(CLIENT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return { visitorId, galleries }
}

/**
 * Ce qu'il faut savoir d'une galerie pour decider si on la laisse voir.
 * Volontairement reduit : le controle ne depend de rien d'autre.
 */
export type GalleryAccess = {
  id: string
  published: boolean
  expiresAt: Date | null
}

/** Galerie fermee au public : jamais publiee, ou dont la date est passee. */
export function isGalleryClosed(gallery: GalleryAccess): boolean {
  return (
    !gallery.published ||
    (gallery.expiresAt !== null && gallery.expiresAt < new Date())
  )
}

/**
 * Le demandeur peut-il voir cette galerie ?
 *
 * La photographe, oui, sans condition : previsualiser un brouillon ou rouvrir
 * une galerie expiree est precisement ce qu'on attend d'elle.
 *
 * Le client, seulement s'il a saisi le bon code ET si la galerie est encore
 * ouverte. Cette seconde condition n'est pas une redite : son cookie vaut
 * trente jours et ne sait rien de la date d'expiration. Sans elle, expirer ou
 * depublier une galerie fermait la page mais laissait les fichiers sortir —
 * un onglet reste ouvert suffisait a tout telecharger apres coup.
 */
export async function canReadGallery(
  request: FastifyRequest,
  gallery: GalleryAccess,
): Promise<boolean> {
  if (await readSession(request)) return true
  if (isGalleryClosed(gallery)) return false

  const client = await readClient(request)
  return client?.galleries.includes(gallery.id) ?? false
}
