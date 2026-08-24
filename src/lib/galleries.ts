import { api, ApiError, assetUrl } from './api'

/* ==================================================================
   ACCES AUX DONNEES
   ------------------------------------------------------------------
   Tout passe par ce fichier, et par lui seul. Aucun composant n'appelle
   fetch directement.

   Les donnees viennent maintenant de l'API : plus rien n'est stocke
   dans le navigateur. Les signatures sont restees celles de la maquette,
   c'est ce qui a permis de basculer sans toucher aux composants.
   ================================================================== */

export type Photo = {
  id: string
  /** Image pleine definition, affichee dans la visionneuse */
  src: string
  /** Vignette de la grille */
  thumb: string
  width: number
  height: number
  alt: string
}

export type Gallery = {
  id: string
  code: string
  clientName: string
  title: string
  /** Date de la seance, yyyy-mm-dd */
  shotAt: string
  /** Date d'expiration de l'acces, yyyy-mm-dd. null = pas d'expiration */
  expiresAt: string | null
  downloadEnabled: boolean
  /** Une galerie non publiee refuse le code, meme correct */
  published: boolean
  /**
   * Galerie limitee : le client choisit un nombre fixe de photos, valide son
   * choix, et ne telecharge que celles-la. Les photos consultees portent
   * alors un filigrane.
   */
  limitedSelection: boolean
  /** Nombre de photos comprises, quand la galerie est limitee */
  selectionLimit: number
  /** Demander au client l'autorisation de diffuser ses photos */
  imageConsentRequested: boolean
  createdAt: string
  photos: Photo[]
}

/* ------------------ Autorisation de diffusion --------------------- */

export type ConsentAnswer = {
  granted: boolean
  /** Nom saisi par la personne : l'equivalent d'une signature */
  signerName: string
  /** Restrictions exprimees en clair */
  notes: string
  decidedAt: string
}

export type ConsentState = {
  /** false = la photographe n'a pas souhaite poser la question ici */
  requested: boolean
  terms: { version: string; text: string }
  /** Derniere reponse en date, ou null */
  answer: ConsentAnswer | null
}

export async function getConsent(code: string): Promise<ConsentState> {
  return api<ConsentState>(
    `/api/client/gallery/${encodeURIComponent(code)}/consent`,
  )
}

/**
 * Repond a la demande d'autorisation.
 * Chaque reponse s'ajoute au journal du serveur : revenir sur son accord est
 * possible, mais n'efface pas le fait qu'il a existe.
 */
export async function answerConsent(
  code: string,
  input: { granted: boolean; signerName: string; notes: string },
): Promise<ConsentAnswer> {
  const { answer } = await api<{ answer: ConsentAnswer }>(
    `/api/client/gallery/${encodeURIComponent(code)}/consent`,
    { method: 'POST', body: input },
  )
  return answer
}

/**
 * Suivi de la livraison, ajoute aux galeries lues cote photographe.
 *
 * Une galerie envoyee est une galerie dont on ne sait plus rien : ces champs
 * disent si la cliente a ouvert, ou elle en est de son choix, et si elle est
 * repartie avec ses photos. Les visites de la photographe n'y figurent pas.
 */
export type GalleryStatus = {
  /** Premiere ouverture par le client. null = jamais ouverte */
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  /** Dernier telechargement, archive ou photo seule */
  lastDownloadedAt: string | null
  /** Photos retenues par le client */
  selectedCount: number
  /** Date a laquelle le client a fige son choix, sur galerie limitee */
  validatedAt: string | null
  /** Reponse du client a la demande de droit a l'image, ou null */
  imageConsent: (ConsentAnswer & { termsVersion: string }) | null
}

/** Galerie vue par la photographe : la galerie, plus son suivi. */
export type GalleryWithStatus = Gallery & GalleryStatus

export type AccessErrorCode = 'not_found' | 'expired' | 'network'

export class AccessError extends Error {
  readonly code: AccessErrorCode

  constructor(code: AccessErrorCode) {
    super(code)
    this.name = 'AccessError'
    this.code = code
  }
}

/** Message affichable a un client, par code d'erreur */
export function accessErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'too_many_requests') {
    return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
  }
  const code = err instanceof AccessError ? err.code : 'network'
  switch (code) {
    case 'not_found':
      return 'Ce code ne correspond à aucune galerie. Vérifiez la saisie.'
    case 'expired':
      return "Cette galerie n'est plus accessible. Contactez-moi pour la rouvrir."
    default:
      return 'La connexion a échoué. Réessayez dans un instant.'
  }
}

/** L'API renvoie des chemins relatifs ; on les rend utilisables tels quels. */
function hydrate<T extends Gallery>(gallery: T): T {
  return {
    ...gallery,
    photos: gallery.photos.map((photo) => ({
      ...photo,
      src: assetUrl(photo.src),
      thumb: assetUrl(photo.thumb),
    })),
  }
}

function toAccessError(error: unknown): AccessError | ApiError {
  if (error instanceof ApiError) {
    if (error.status === 410) return new AccessError('expired')
    if (error.status === 404 || error.status === 403) return new AccessError('not_found')
    if (error.status === 429) return error
  }
  return new AccessError('network')
}

/* --------------------------- Parcours client ---------------------- */

/** Saisie du code : ouvre la galerie et obtient le droit de la consulter. */
export async function openGallery(code: string): Promise<Gallery> {
  try {
    const { gallery } = await api<{ gallery: Gallery }>('/api/client/access', {
      method: 'POST',
      body: { code: code.trim() },
    })
    return hydrate(gallery)
  } catch (error) {
    throw toAccessError(error)
  }
}

/** Relecture apres rechargement, sur la foi du cookie deja obtenu. */
export async function reopenGallery(code: string): Promise<Gallery> {
  try {
    const { gallery } = await api<{ gallery: Gallery }>(
      `/api/client/gallery/${encodeURIComponent(code)}`,
    )
    return hydrate(gallery)
  } catch (error) {
    throw toAccessError(error)
  }
}

/**
 * Apercu client, cote photographe.
 *
 * Passe par la route photographe et non par `/api/client/access` : ce dernier
 * lui poserait un cookie de visiteuse, et ses coups de coeur se melangeraient
 * a ceux de sa cliente. Ici elle ne fait que regarder.
 */
export async function previewGallery(code: string): Promise<GalleryWithStatus> {
  const { gallery } = await api<{ gallery: GalleryWithStatus }>(
    `/api/galleries/by-code/${encodeURIComponent(code.toUpperCase())}`,
  )
  return hydrate(gallery)
}

/**
 * Etat de la selection d'une galerie.
 *
 * Elle appartient a la galerie, pas a l'appareil : tous ceux qui ont le code
 * voient et modifient la meme liste. C'est ce qui permet a un couple de choisir
 * a deux, et ce qui fait qu'un forfait de dix photos reste un forfait de dix.
 */
export type SelectionState = {
  favorites: Set<string>
  /** Selection figee : plus aucune modification possible */
  validated: boolean
}

export async function listFavorites(code: string): Promise<SelectionState> {
  try {
    const { favorites, validated } = await api<{
      favorites: string[]
      validated: boolean
    }>(`/api/client/gallery/${encodeURIComponent(code)}/favorites`)
    return { favorites: new Set(favorites), validated }
  } catch {
    return { favorites: new Set(), validated: false }
  }
}

/**
 * Fige la selection sur une galerie limitee.
 * Irreversible : c'est ce qui ouvre le telechargement.
 */
export async function validateSelection(code: string): Promise<void> {
  await api(`/api/client/gallery/${encodeURIComponent(code)}/validate`, {
    method: 'POST',
  })
}

/**
 * Ajoute ou retire une photo, et renvoie la selection telle qu'elle est
 * vraiment apres l'operation : l'autre ecran a pu bouger entre-temps.
 */
export async function setFavorite(
  photoId: string,
  favorite: boolean,
): Promise<SelectionState> {
  const result = await api<{ favorites: string[]; validated: boolean }>(
    `/api/client/favorites/${photoId}`,
    { method: 'PUT', body: { favorite } },
  )
  return { favorites: new Set(result.favorites), validated: result.validated }
}

/** Telechargement d'une photo : le navigateur suit le lien, cookies compris. */
export function photoDownloadUrl(photoId: string): string {
  return assetUrl(`/api/photos/${photoId}/download`)
}

/**
 * Archive de la galerie, ou de la seule selection.
 * Le zip est assemble et diffuse par le serveur : plus de telechargements
 * en rafale cote navigateur.
 */
export function archiveUrl(code: string, onlyFavorites: boolean): string {
  const suffix = onlyFavorites ? '?only=favorites' : ''
  return assetUrl(`/api/client/gallery/${encodeURIComponent(code)}/archive${suffix}`)
}

/* ---------------------------- Cote photographe -------------------- */

export async function listGalleries(): Promise<GalleryWithStatus[]> {
  const { galleries } = await api<{ galleries: GalleryWithStatus[] }>('/api/galleries')
  return galleries.map(hydrate)
}

export async function getGallery(id: string): Promise<GalleryWithStatus> {
  const { gallery } = await api<{ gallery: GalleryWithStatus }>(`/api/galleries/${id}`)
  return hydrate(gallery)
}

export type NewGallery = {
  title: string
  clientName: string
  code: string
  shotAt: string
  expiresAt: string | null
  downloadEnabled: boolean
  published: boolean
  limitedSelection: boolean
  selectionLimit: number
  imageConsentRequested: boolean
}

export async function createGallery(input: NewGallery): Promise<GalleryWithStatus> {
  const { gallery } = await api<{ gallery: GalleryWithStatus }>('/api/galleries', {
    method: 'POST',
    body: { ...input, code: input.code.trim().toUpperCase() },
  })
  return hydrate(gallery)
}

export async function updateGallery(
  id: string,
  patch: Partial<NewGallery>,
): Promise<GalleryWithStatus> {
  const { gallery } = await api<{ gallery: GalleryWithStatus }>(`/api/galleries/${id}`, {
    method: 'PATCH',
    body: patch.code ? { ...patch, code: patch.code.trim().toUpperCase() } : patch,
  })
  return hydrate(gallery)
}

export async function deleteGallery(id: string): Promise<void> {
  await api(`/api/galleries/${id}`, { method: 'DELETE' })
}

/* --------------------------- Stockage ----------------------------- */

export type Storage = {
  usedBytes: number
  /** Capacite du disque du serveur, telle qu'elle est declaree */
  quotaBytes: number
  files: number
  galleryCount: number
  /** Poids de la plus grosse galerie, etalon pour estimer ce qui reste */
  largestGalleryBytes: number
}

export async function getStorage(): Promise<Storage> {
  return api<Storage>('/api/storage')
}

/* ----------------------- Import de photos ------------------------- */

export type ImportProgress = {
  done: number
  total: number
  current: string
  /** Fichiers que le serveur a refuses */
  failed: string[]
}

/**
 * Envoie les fichiers un par un plutot qu'en une requete geante : la
 * progression devient reelle, et un fichier en echec n'emporte pas le lot.
 */
export async function addPhotos(
  galleryId: string,
  files: File[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<GalleryWithStatus> {
  const failed: string[] = []
  let latest: GalleryWithStatus | null = null

  for (const [index, file] of files.entries()) {
    onProgress?.({ done: index, total: files.length, current: file.name, failed })

    const form = new FormData()
    form.append('files', file)

    try {
      const result = await api<{ gallery: GalleryWithStatus; failed: string[] }>(
        `/api/galleries/${galleryId}/photos`,
        { method: 'POST', body: form },
      )
      latest = result.gallery
      failed.push(...result.failed)
    } catch {
      failed.push(file.name)
    }
  }

  onProgress?.({ done: files.length, total: files.length, current: '', failed })

  return hydrate(latest ?? (await getGallery(galleryId)))
}

export async function removePhoto(
  galleryId: string,
  photoId: string,
): Promise<GalleryWithStatus> {
  const { gallery } = await api<{ gallery: GalleryWithStatus }>(
    `/api/galleries/${galleryId}/photos/${photoId}`,
    { method: 'DELETE' },
  )
  return hydrate(gallery)
}

/* ------------------------------ Codes ----------------------------- */

/**
 * Code lisible, sans caracteres ambigus (ni O/0 ni I/1).
 *
 * Lettres et chiffres alternent : c'est aussi lisible, mais ca rend
 * structurellement impossible de tomber par hasard sur un mot malheureux.
 * Ces codes partent a des familles.
 * L'unicite est verifiee par le serveur, qui repond `code_taken`.
 */
export function generateCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)]

  let code = ''
  for (let i = 0; i < 4; i += 1) {
    code += pick(letters) + pick(digits)
  }
  return code
}
