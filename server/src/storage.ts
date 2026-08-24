import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { env } from './env.js'

/**
 * Stockage des fichiers photo.
 *
 * Aujourd'hui : disque local. Pour passer a un stockage objet (S3, R2), seul
 * ce module change ; les routes manipulent uniquement des cles opaques.
 */

const root = path.resolve(env.UPLOAD_DIR)

/** Empeche toute cle de sortir du dossier d'upload (traversee de chemin). */
function resolveKey(key: string): string {
  const full = path.resolve(root, key)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Cle de stockage invalide')
  }
  return full
}

export async function ensureReady(): Promise<void> {
  await mkdir(root, { recursive: true })
}

export async function put(key: string, data: Buffer): Promise<void> {
  const full = resolveKey(key)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, data)
  forgetUsage()
}

/** Type concret `Readable` : archiver et Fastify le veulent, pas l'interface large. */
export function streamOf(key: string): Readable {
  return createReadStream(resolveKey(key))
}

/** Lecture en memoire, pour les fichiers qu'il faut retraiter (filigrane). */
export function readBuffer(key: string): Promise<Buffer> {
  return readFile(resolveKey(key))
}

export async function exists(key: string): Promise<boolean> {
  try {
    await stat(resolveKey(key))
    return true
  } catch {
    return false
  }
}

/**
 * Windows refuse d'effacer un fichier encore ouvert : une photo que l'on vient
 * de servir peut rester verrouillee une fraction de seconde. Sans ces essais,
 * la suppression d'une galerie echoue alors que la ligne est deja partie de la
 * base, et laisse des fichiers orphelins.
 */
const RM_RETRY = { maxRetries: 5, retryDelay: 120 } as const

export async function remove(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true, ...RM_RETRY })
  forgetUsage()
}

/** Supprime tout le dossier d'une galerie (a sa suppression). */
export async function removeGallery(galleryId: string): Promise<void> {
  await rm(resolveKey(galleryId), { recursive: true, force: true, ...RM_RETRY })
  forgetUsage()
}

/* ------------------------- Occupation du disque ------------------------ */

export type Usage = {
  /** Total occupe par les fichiers photo, en octets */
  bytes: number
  files: number
  /** Poids de chaque galerie, cle = son identifiant */
  byGallery: Record<string, number>
}

/**
 * Parcourir l'arborescence coute quelques centaines de millisecondes sur une
 * grosse galerie. Inutile de recommencer a chaque affichage du tableau de bord.
 */
const USAGE_TTL_MS = 60_000
let cachedUsage: { at: number; value: Usage } | null = null

async function weigh(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { bytes, files }
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await weigh(full)
      bytes += sub.bytes
      files += sub.files
    } else if (entry.isFile()) {
      try {
        bytes += (await stat(full)).size
        files += 1
      } catch {
        // Fichier efface pendant le parcours : il ne compte plus, c'est tout.
      }
    }
  }

  return { bytes, files }
}

export async function usage(): Promise<Usage> {
  if (cachedUsage && Date.now() - cachedUsage.at < USAGE_TTL_MS) {
    return cachedUsage.value
  }

  const value: Usage = { bytes: 0, files: 0, byGallery: {} }

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return value
  }

  // Un dossier de premier niveau = une galerie.
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const { bytes, files } = await weigh(path.join(root, entry.name))
    value.byGallery[entry.name] = bytes
    value.bytes += bytes
    value.files += files
  }

  cachedUsage = { at: Date.now(), value }
  return value
}

/** A appeler quand le disque vient de changer, pour ne pas afficher un chiffre perime. */
export function forgetUsage(): void {
  cachedUsage = null
}

export function keysFor(galleryId: string, photoId: string, ext: string) {
  return {
    storageKey: path.posix.join(galleryId, `${photoId}${ext}`),
    thumbKey: path.posix.join(galleryId, 'thumbs', `${photoId}.webp`),
    // Utilisee seulement pour les originaux non affichables (RAW).
    previewKey: path.posix.join(galleryId, 'previews', `${photoId}.jpg`),
  }
}

/**
 * Cles du cache de filigrane. Definies ici, et pas la ou on les fabrique :
 * le service des fichiers et la suppression doivent designer exactement les
 * memes, sinon les caches survivent aux photos qu'ils representent.
 */
export function watermarkKey(
  galleryId: string,
  photoId: string,
  variant: 'thumb' | 'preview',
): string {
  return path.posix.join(galleryId, 'wm', `${photoId}-${variant}.webp`)
}

/**
 * Version intermediaire d'une photo, sans filigrane, pour l'atelier de
 * stories. Servir l'original y ferait transiter une dizaine de megaoctets
 * par photo, pour dessiner ensuite a 1080 pixels de large.
 */
export function renditionKey(galleryId: string, photoId: string): string {
  return path.posix.join(galleryId, 'rendition', `${photoId}.jpg`)
}

export function watermarkKeys(galleryId: string, photoId: string): string[] {
  return [
    watermarkKey(galleryId, photoId, 'thumb'),
    watermarkKey(galleryId, photoId, 'preview'),
  ]
}

/**
 * Vide tout le cache de filigrane d'une galerie.
 * Appele quand l'option « galerie limitee » change : les images gardees ne
 * correspondent plus a ce que la galerie doit montrer.
 */
export async function removeWatermarkCache(galleryId: string): Promise<void> {
  await rm(resolveKey(path.posix.join(galleryId, 'wm')), {
    recursive: true,
    force: true,
    ...RM_RETRY,
  })
}
