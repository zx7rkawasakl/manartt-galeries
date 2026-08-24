import sharp from 'sharp'
import { extractPreview, isRawFilename } from './raw.js'

export const THUMB_WIDTH = 900

export type ProcessedImage = {
  width: number
  height: number
  thumbnail: Buffer
  /**
   * Image affichable quand l'original ne l'est pas (RAW d'appareil photo).
   * null pour un JPEG ou un PNG, qui s'affichent tels quels.
   */
  preview: Buffer | null
}

/** Formats affichables acceptes directement. */
export const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/tiff',
])

/**
 * Un RAW arrive presque toujours en `application/octet-stream` : aucun type
 * MIME n'est enregistre pour ces formats. C'est donc l'extension qui tranche.
 */
export function isAccepted(mimetype: string, filename: string): boolean {
  return ACCEPTED_MIME.has(mimetype) || isRawFilename(filename)
}

/** Fabrique la vignette a partir d'une image deja affichable. */
async function makeThumbnail(source: Buffer, width: number): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize({ width: Math.min(THUMB_WIDTH, width), withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}

/**
 * Lit les dimensions reelles et fabrique la vignette.
 *
 * Le traitement est fait ici et pas dans le navigateur : les dimensions
 * servent a calculer la grille justifiee, et une valeur fausse casserait la
 * mise en page. On ne fait pas confiance a ce que le client envoie.
 */
export async function process(
  input: Buffer,
  filename: string,
): Promise<ProcessedImage> {
  if (isRawFilename(filename)) {
    // Aucun navigateur n'affiche un RAW, et sharp ne sait pas le decoder :
    // on recupere l'apercu JPEG que le boitier a embarque dans le fichier.
    const preview = await extractPreview(input)
    if (!preview) {
      throw new Error("RAW sans aperçu exploitable : impossible d'en tirer une image")
    }

    return {
      width: preview.width,
      height: preview.height,
      thumbnail: await makeThumbnail(preview.jpeg, preview.width),
      preview: preview.jpeg,
    }
  }

  // `rotate()` sans argument applique l'orientation EXIF : sans ca les photos
  // prises a la verticale ressortent couchees.
  const pipeline = sharp(input, { failOn: 'error' }).rotate()
  const metadata = await pipeline.metadata()

  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (width === 0 || height === 0) {
    throw new Error('Image illisible : dimensions introuvables')
  }

  return {
    width,
    height,
    thumbnail: await pipeline
      .clone()
      .resize({ width: Math.min(THUMB_WIDTH, width), withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
    preview: null,
  }
}

/** Largeur des versions destinees a l'atelier de stories (le double du
 *  format Instagram, pour rester net apres recadrage). */
export const RENDITION_WIDTH = 2160

/** Photo redimensionnee, sans filigrane. Fabriquee a la demande, puis gardee. */
export async function rendition(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: RENDITION_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 88, progressive: true })
    .toBuffer()
}
