import path from 'node:path'
import sharp from 'sharp'

/* ==================================================================
   FICHIERS RAW D'APPAREIL PHOTO
   ------------------------------------------------------------------
   Un RAW (.ORF chez Olympus / OM System, .CR2, .NEF...) n'est affichable
   par aucun navigateur, et sharp ne sait pas le decoder : libvips est
   compile sans LibRaw.

   Plutot que de developper le RAW (lent, et cela demanderait une
   dependance native lourde), on recupere l'apercu JPEG que le boitier a
   lui-meme place dans le fichier. Il est en general en pleine definition
   et deja developpe par l'appareil, donc fidele au rendu attendu.

   L'original, lui, est conserve intact : c'est ce que le client telecharge.
   ================================================================== */

/** Extensions RAW reconnues. La liste peut s'etendre sans rien changer d'autre. */
const RAW_EXTENSIONS = new Set([
  '.orf', // Olympus / OM System
  '.cr2',
  '.cr3', // Canon
  '.nef',
  '.nrw', // Nikon
  '.arw',
  '.srf',
  '.sr2', // Sony
  '.raf', // Fujifilm
  '.rw2', // Panasonic
  '.pef', // Pentax
  '.dng', // Adobe / universel
])

export function isRawFilename(filename: string): boolean {
  return RAW_EXTENSIONS.has(path.extname(filename).toLowerCase())
}

/** Positions des debuts de flux JPEG (marqueur SOI) dans le fichier. */
function findJpegStarts(buffer: Buffer, max: number): number[] {
  const starts: number[] = []
  for (let i = 0; i + 2 < buffer.length && starts.length < max; i += 1) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      starts.push(i)
    }
  }
  return starts
}

export type RawPreview = {
  jpeg: Buffer
  width: number
  height: number
}

/**
 * Extrait le plus grand apercu JPEG contenu dans un RAW.
 *
 * Chaque candidat est reellement decode avant d'etre retenu : une suite
 * d'octets ressemblant a un en-tete JPEG peut apparaitre par hasard dans les
 * donnees du capteur, et seul le decodage permet de faire le tri.
 */
export async function extractPreview(buffer: Buffer): Promise<RawPreview | null> {
  // Au-dela de quelques candidats on perd son temps : un RAW en contient
  // rarement plus de trois (miniature EXIF, apercu ecran, apercu pleine taille).
  const starts = findJpegStarts(buffer, 12)

  let best: RawPreview | null = null

  for (const start of starts) {
    // Le decodeur s'arrete de lui-meme au marqueur de fin : inutile de
    // chercher ou se termine exactement le flux.
    const slice = buffer.subarray(start)

    try {
      const meta = await sharp(slice).metadata()
      if (!meta.width || !meta.height) continue

      if (!best || meta.width * meta.height > best.width * best.height) {
        // On re-encode : le flux extrait traine tout le reste du RAW derriere
        // lui, on ne va pas stocker 20 Mo pour un apercu.
        const jpeg = await sharp(slice)
          .rotate()
          .jpeg({ quality: 90 })
          .toBuffer()

        const clean = await sharp(jpeg).metadata()
        best = {
          jpeg,
          width: clean.width ?? meta.width,
          height: clean.height ?? meta.height,
        }
      }
    } catch {
      // Faux positif : cette suite d'octets n'etait pas un JPEG.
    }
  }

  return best
}
