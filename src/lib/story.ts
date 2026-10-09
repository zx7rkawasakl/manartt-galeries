import { assetUrl } from './api'
import texte1 from '../assets/texte-livree-1.png'
import texte2 from '../assets/texte-livree-2.png'
import texte3 from '../assets/texte-livree-3.png'
import texte4 from '../assets/texte-livree-4.png'

/* ==================================================================
   ATELIER DE STORIES
   ------------------------------------------------------------------
   Fabrique une image 1080x1920 a partir des photos des galeries.

   Le rendu se fait dans le navigateur, sur un canvas, et non sur le
   serveur : chaque frappe au clavier se voit aussitot. Un aller-retour
   reseau par caractere rendrait l'outil inutilisable pour ce qu'il est,
   c'est-a-dire un outil de mise en page.
   ================================================================== */

export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920

/** Palette man.artt, recopiee ici : le canvas ne lit pas les variables CSS. */
const INK = '#1c1a17'

/**
 * Les photos couvrent toute l'image : ni marge, ni gouttiere, ni logo.
 * Le fond sombre ne se voit donc que la ou un emplacement reste vide.
 */
const FOND = INK

/* ---------------------------- Dispositions -------------------------- */

/**
 * Une disposition, c'est le nombre de photos par rangee.
 * `[3, 3, 3]` = trois rangees de trois. Ajouter une disposition tient donc
 * en une ligne, et le dessin s'adapte tout seul.
 *
 * `weights` donne la hauteur relative de chaque rangee. Absent, toutes se
 * partagent la hauteur a parts egales.
 */
export type Layout = {
  id: string
  label: string
  rows: number[]
  weights?: number[]
}

export const LAYOUTS: Layout[] = [
  { id: '2x2', label: '2 × 2', rows: [2, 2] },
  { id: '3x2', label: '3 × 2', rows: [2, 2, 2] },
  { id: '3x3', label: '3 × 3', rows: [3, 3, 3] },
  { id: '4x1', label: '4 × 1', rows: [1, 1, 1, 1] },
  { id: '2-1-2', label: '2 / 1 / 2', rows: [2, 1, 2] },
  {
    id: '2-1-1-2',
    label: '2 / 1 / 1 / 2',
    rows: [2, 1, 1, 2],
    // Un tiers, un sixieme, un sixieme, un tiers : les deux rangees du
    // milieu forment une bande etroite entre deux rangees hautes.
    weights: [2, 1, 1, 2],
  },
  { id: '3-2-3', label: '3 / 2 / 3', rows: [3, 2, 3] },
]

export function photoCount(layout: Layout): number {
  return layout.rows.reduce((total, n) => total + n, 0)
}

/** Poids effectifs : ceux de la disposition, ou des rangees egales. */
export function weightsOf(layout: Layout): number[] {
  return layout.weights ?? layout.rows.map(() => 1)
}

/* ------------------------------- Textes ------------------------------ */

/**
 * Textes pre-composes, proposes dans le menu « Texte ».
 *
 * Ce sont des CALQUES, pas du texte dessine par le code : la photographe les
 * a mis en page elle-meme. On les pose tels quels, sans toucher a la typo, a
 * la taille, a la couleur, aux ombres ni au placement.
 *
 * Fabrication : les fichiers d'origine sont du blanc sur noir pur. Leur
 * luminance a ete transformee en opacite, ce qui restitue exactement le meme
 * rendu par-dessus n'importe quelle photo. Voir `src/assets/texte-livree-*`.
 */
export type StoryText = {
  id: string
  /** Nom affiche dans le menu */
  label: string
  src: string
}

export const TEXTS: StoryText[] = [
  { id: 'livree-1', label: 'Galerie livrée — centré', src: texte1 },
  { id: 'livree-2', label: 'Galerie livrée — une ligne', src: texte2 },
  { id: 'livree-3', label: 'Galerie livrée — à droite', src: texte3 },
  { id: 'livree-4', label: 'Galerie livrée — en diagonale', src: texte4 },
]

/* ------------------------- Outils de dessin ------------------------ */

/* --------------------------- Recadrage ----------------------------- */

/**
 * Position d'une photo dans son cadre.
 *
 * `nx` et `ny` vont de -1 a 1 : ce sont des FRACTIONS du deplacement possible,
 * pas des pixels. Ainsi un recadrage reste valable quand on change de
 * disposition et que la case n'a plus la meme taille — et surtout, il devient
 * impossible de faire glisser la photo au point de decouvrir le fond.
 */
export type Transform = { zoom: number; nx: number; ny: number }

export const IDENTITY: Transform = { zoom: 1, nx: 0, ny: 0 }
export const ZOOM_MIN = 1
export const ZOOM_MAX = 4

export function clampTransform(t: Transform): Transform {
  return {
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, t.zoom)),
    nx: Math.min(1, Math.max(-1, t.nx)),
    ny: Math.min(1, Math.max(-1, t.ny)),
  }
}

export type Rect = { x: number; y: number; w: number; h: number }

/** Marge de manoeuvre, en pixels, dans chaque direction. */
export function panRange(
  image: HTMLImageElement,
  cell: Rect,
  zoom: number,
): { maxX: number; maxY: number } {
  const iw = image.naturalWidth || 1
  const ih = image.naturalHeight || 1
  const ratio = Math.max(cell.w / iw, cell.h / ih) * zoom
  return {
    maxX: Math.max(0, (iw * ratio - cell.w) / 2),
    maxY: Math.max(0, (ih * ratio - cell.h) / 2),
  }
}

/** Dessine l'image en « cover », decalee et zoomee selon `t`. */
function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cell: Rect,
  t: Transform,
) {
  const iw = image.naturalWidth || 0
  const ih = image.naturalHeight || 0
  if (!iw || !ih || cell.w <= 0 || cell.h <= 0) return

  const ratio = Math.max(cell.w / iw, cell.h / ih) * t.zoom
  const dw = iw * ratio
  const dh = ih * ratio
  const { maxX, maxY } = panRange(image, cell, t.zoom)

  ctx.save()
  ctx.beginPath()
  ctx.rect(cell.x, cell.y, cell.w, cell.h)
  ctx.clip()
  ctx.drawImage(
    image,
    cell.x + (cell.w - dw) / 2 + t.nx * maxX,
    cell.y + (cell.h - dh) / 2 + t.ny * maxY,
    dw,
    dh,
  )
  ctx.restore()
}

/**
 * Emplacements de la disposition, en pixels du canvas.
 *
 * Une seule source pour le dessin ET pour savoir sur quelle photo on vient de
 * cliquer : deux calculs separes finiraient par diverger.
 */
export function cells(layout: Layout): Rect[] {
  const poids = weightsOf(layout)
  const total = poids.reduce((t, p) => t + p, 0)
  const rects: Rect[] = []
  let cumul = 0

  layout.rows.forEach((colonnes, r) => {
    // Frontieres cumulees : la rangee suivante repart exactement d'ou celle-ci
    // s'arrete, quels que soient les arrondis.
    const y = Math.round((cumul * STORY_HEIGHT) / total)
    cumul += poids[r] ?? 1
    const yFin = Math.round((cumul * STORY_HEIGHT) / total)

    for (let c = 0; c < colonnes; c += 1) {
      const x = Math.round((c * STORY_WIDTH) / colonnes)
      const xFin = Math.round(((c + 1) * STORY_WIDTH) / colonnes)
      rects.push({ x, y, w: xFin - x, h: yFin - y })
    }
  })

  return rects
}

/**
 * Emplacement encore vide. Visible seulement pendant la composition : une
 * fois la grille complete, il ne reste que des photos.
 */
function placeholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 10])
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
  ctx.setLineDash([])
}

/* ------------------------------ Rendu ------------------------------- */

export type DrawInput = {
  layout: Layout
  /** Dans l'ordre des emplacements ; les trous restent vides. */
  photos: (HTMLImageElement | null)[]
  /** Calque de texte deja charge, ou null. */
  overlay: HTMLImageElement | null
  /** Recadrage de chaque emplacement, par index. */
  transforms?: (Transform | undefined)[]
  /**
   * Emplacement en cours d'ajustement, souligne a l'ecran.
   * A remettre a null avant l'export : ce reperage ne doit pas partir
   * dans le fichier livre.
   */
  active?: number | null
  /**
   * Echange en cours : la case d'origine s'estompe, la case visee
   * s'encadre. Comme `active`, jamais present dans le fichier exporte.
   */
  glisse?: { depuis: number; vers: number | null } | null
}

export function render(canvas: HTMLCanvasElement, input: DrawInput): void {
  canvas.width = STORY_WIDTH
  canvas.height = STORY_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = FOND
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)
  ctx.textBaseline = 'alphabetic'

  // La grille occupe l'image entiere.
  cells(input.layout).forEach((cell, index) => {
    const photo = input.photos[index]
    if (photo) cover(ctx, photo, cell, input.transforms?.[index] ?? IDENTITY)
    else placeholder(ctx, cell.x, cell.y, cell.w, cell.h)
  })

  // Le calque de texte se pose tel quel, a l'echelle exacte du canvas.
  // Aucun voile, aucun ajustement : la mise en page est celle de la
  // photographe, elle ne se retouche pas ici.
  if (input.overlay) {
    ctx.drawImage(input.overlay, 0, 0, STORY_WIDTH, STORY_HEIGHT)
  }

  // Echange en cours. L'origine est voilee plutot qu'effacee : on doit
  // encore reconnaitre ce qu'on est en train de deplacer.
  if (input.glisse) {
    const cases = cells(input.layout)
    const origine = cases[input.glisse.depuis]
    if (origine) {
      ctx.fillStyle = 'rgba(28,26,23,0.55)'
      ctx.fillRect(origine.x, origine.y, origine.w, origine.h)
    }
    const vers = input.glisse.vers
    const cible = vers != null && vers !== input.glisse.depuis ? cases[vers] : null
    if (cible) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 10
      ctx.strokeRect(cible.x + 5, cible.y + 5, cible.w - 10, cible.h - 10)
    }
  }

  // Reperage de l'emplacement en cours d'ajustement. Dessine en dernier, et
  // jamais present lors de l'export : voir `exportBlob`.
  if (input.active != null && !input.glisse) {
    const cell = cells(input.layout)[input.active]
    if (cell) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 6
      ctx.setLineDash([22, 16])
      ctx.strokeRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6)
      ctx.setLineDash([])
    }
  }
}

/* ------------------------ Chargement d'images ---------------------- */

/**
 * Charge une photo pour le canvas.
 *
 * On passe par `fetch` puis par un blob, et non par `img.src = url` : la
 * requete doit emporter le cookie de session, et l'image doit rester de meme
 * origine pour que le canvas ne soit pas « teinte » — un canvas teinte refuse
 * d'etre exporte, et c'est justement ce qu'on veut en sortie.
 *
 * `original=1` reclame la version sans filigrane, que le serveur ne concede
 * qu'a une session photographe.
 */
export async function loadPhoto(photoId: string): Promise<HTMLImageElement> {
  const response = await fetch(assetUrl(`/api/photos/${photoId}/file?original=1`), {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('photo indisponible')

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  try {
    return await decode(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Charge un calque de texte (image locale, deja transparente). */
export function loadOverlay(src: string): Promise<HTMLImageElement> {
  return decode(src)
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image illisible'))
    image.src = src
  })
}

/**
 * Image finale.
 *
 * On redessine sans le reperage avant d'exporter : sinon le pointille de
 * l'emplacement selectionne partirait dans le fichier livre. Le reperage est
 * ensuite remis, pour que l'ecran ne clignote pas.
 */
export async function exportBlob(
  canvas: HTMLCanvasElement,
  input: DrawInput,
): Promise<Blob | null> {
  render(canvas, { ...input, active: null, glisse: null })
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  )
  render(canvas, input)
  return blob
}
