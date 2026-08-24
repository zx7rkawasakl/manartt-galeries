import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp, { type Sharp } from 'sharp'

/**
 * Filigrane man.artt applique aux galeries limitees.
 *
 * Ce que ca fait : rendre inexploitable ce qui est affiche a l'ecran. Une
 * capture reste possible, mais elle emporte le logo et une definition web.
 * Ce que ca ne fait pas : empecher la capture. Rien ne le peut cote navigateur.
 *
 * Les fichiers livres au client apres validation de sa selection ne passent
 * jamais par ici : ils partent intacts.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const LOGO = path.resolve(here, '../assets/watermark-logo.png')

/**
 * Le logo est un trait blanc. Seul, il disparaitrait sur les photos claires
 * (ciel pastel, sable, robe blanche), qui sont justement le repertoire de la
 * photographe. On le double donc d'une ombre sombre : le motif reste lisible
 * sur un fond clair comme sur un fond sombre.
 */
const WHITE_OPACITY = 0.5
const SHADOW_OPACITY = 0.38
/** Inclinaison : un logo en biais resiste mieux au recadrage. */
const ANGLE = -30
/** Le motif occupe environ ce quotient du petit cote : regle l'espacement. */
const DIVISOR = 3

/** Les motifs sont couteux a fabriquer : on les garde par taille. */
const tiles = new Map<number, Promise<Buffer>>()

/** Multiplie l'alpha d'une image par un facteur, sans toucher aux couleurs. */
function fade(image: Sharp, opacity: number) {
  // `dest-in` multiplie l'alpha existant par celui de ce calque uniforme :
  // le trait s'estompe sans que le fond transparent ne noircisse.
  return image.composite([
    {
      input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in',
    },
  ])
}

/** Fabrique un motif carre de exactement `tileSize` pixels de cote. */
async function buildTile(tileSize: number): Promise<Buffer> {
  const logoWidth = Math.round(tileSize * 0.66)

  const base = await sharp(LOGO).resize({ width: logoWidth }).png().toBuffer()
  const { width = logoWidth, height = logoWidth } = await sharp(base).metadata()

  const white = await fade(sharp(base), WHITE_OPACITY).png().toBuffer()

  // `negate` sans l'alpha : le trait blanc devient noir, la transparence reste.
  const shadow = await fade(
    sharp(base).negate({ alpha: false }),
    SHADOW_OPACITY,
  )
    .blur(1.2)
    .png()
    .toBuffer()

  const offset = Math.max(1, Math.round(logoWidth * 0.006))

  // Ombre decalee, puis trait blanc par-dessus.
  const twoTone = await sharp({
    create: {
      width: width + offset,
      height: height + offset,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow, top: offset, left: offset },
      { input: white, top: 0, left: 0 },
    ])
    .png()
    .toBuffer()

  // La rotation agrandit la boite englobante : on la ramene dans le motif.
  const rotated = await sharp(twoTone)
    .rotate(ANGLE, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({
      width: tileSize,
      height: tileSize,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: tileSize,
      height: tileSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: rotated, gravity: 'center' }])
    .png()
    .toBuffer()
}

function tileFor(width: number, height: number): Promise<Buffer> {
  // Le motif ne doit jamais depasser l'image, sinon sharp refuse la composition.
  const shortest = Math.min(width, height)
  const wanted = Math.round(shortest / DIVISOR)
  const size = Math.max(120, Math.min(wanted, shortest))

  // Arrondi par paliers de 40px : deux tailles proches partagent le meme motif.
  const bucket = Math.max(120, Math.round(size / 40) * 40)

  let tile = tiles.get(bucket)
  if (!tile) {
    tile = buildTile(bucket)
    tiles.set(bucket, tile)
  }
  return tile
}

/**
 * Redimensionne puis appose le filigrane.
 * `maxWidth` borne la definition servie : une capture d'ecran d'une image de
 * 1600px ne vaut rien en tirage papier.
 */
export async function watermark(input: Buffer, maxWidth: number): Promise<Buffer> {
  // On materialise le redimensionnement avant de mesurer : `metadata()` sur
  // une instance sharp renvoie les dimensions d'ENTREE, pas celles du resultat.
  const resized = await sharp(input)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .toBuffer()

  const meta = await sharp(resized).metadata()
  const width = meta.width ?? maxWidth
  const height = meta.height ?? maxWidth

  const tile = await tileFor(width, height)

  return sharp(resized)
    .composite([{ input: tile, tile: true, blend: 'over' }])
    .webp({ quality: 78 })
    .toBuffer()
}

/**
 * Definition servie dans la visionneuse d'une galerie limitee.
 * Les vignettes, elles, reprennent `THUMB_WIDTH` de `images.ts` : c'est la
 * meme taille que les vignettes ordinaires, et une seule definition evite
 * qu'elles divergent.
 */
export const PREVIEW_WIDTH = 1600
