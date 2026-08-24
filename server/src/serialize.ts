import type {
  Gallery,
  ImageConsent,
  Photo,
  Selection,
} from '../generated/prisma/client.js'

/**
 * Traduit les enregistrements en la forme exacte attendue par le front.
 * Les URL de fichiers sont construites ici : le client ne connait jamais
 * l'emplacement reel des photos.
 */

/** yyyy-mm-dd, comme les champs <input type="date"> du front. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isoMoment(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

/**
 * Jeton de version colle aux URL d'images.
 *
 * Une photo est servie a la meme adresse quel que soit l'etat de la galerie,
 * avec un cache d'un jour. Sans ce jeton, une galerie qui repasse de limitee a
 * complete continuerait d'afficher les images filigranees que le navigateur du
 * client garde en reserve : le reglage semblerait ne pas avoir pris.
 */
function variantToken(limited: boolean): string {
  return limited ? '?v=wm' : '?v=full'
}

export function photoDto(photo: Photo, variant = variantToken(false)) {
  return {
    id: photo.id,
    src: `/api/photos/${photo.id}/file${variant}`,
    thumb: `/api/photos/${photo.id}/thumb${variant}`,
    width: photo.width,
    height: photo.height,
    alt: photo.originalName.replace(/\.[^.]+$/, ''),
  }
}

export function galleryDto(gallery: Gallery & { photos?: Photo[] }) {
  const variant = variantToken(gallery.limitedSelection)
  return {
    id: gallery.id,
    code: gallery.code,
    title: gallery.title,
    clientName: gallery.clientName,
    shotAt: isoDay(gallery.shotAt),
    expiresAt: gallery.expiresAt ? isoDay(gallery.expiresAt) : null,
    downloadEnabled: gallery.downloadEnabled,
    published: gallery.published,
    limitedSelection: gallery.limitedSelection,
    selectionLimit: gallery.selectionLimit,
    imageConsentRequested: gallery.imageConsentRequested,
    createdAt: gallery.createdAt.toISOString(),
    photos: (gallery.photos ?? []).map((photo) => photoDto(photo, variant)),
  }
}

/**
 * Vue photographe : la galerie, plus le suivi de sa livraison.
 *
 * Ces champs ne partent jamais vers un client. Ils ne lui apprendraient rien
 * d'utile, et le suivi ne regarde que la photographe.
 */
export function galleryAdminDto(
  gallery: Gallery & {
    photos?: Photo[]
    selection?: Selection | null
    /** La plus recente d'abord : c'est la reponse qui fait foi. */
    imageConsents?: ImageConsent[]
    _count?: { favorites: number }
  },
) {
  const consent = gallery.imageConsents?.[0] ?? null

  return {
    ...galleryDto(gallery),
    imageConsent: consent
      ? {
          granted: consent.granted,
          signerName: consent.signerName,
          notes: consent.notes,
          decidedAt: consent.createdAt.toISOString(),
          termsVersion: consent.termsVersion,
        }
      : null,
    firstOpenedAt: isoMoment(gallery.firstOpenedAt),
    lastOpenedAt: isoMoment(gallery.lastOpenedAt),
    lastDownloadedAt: isoMoment(gallery.lastDownloadedAt),
    /** Photos retenues par le client, sur une galerie limitee comme complete. */
    selectedCount: gallery._count?.favorites ?? 0,
    /** Date a laquelle le client a fige son choix, ou null. */
    validatedAt: isoMoment(gallery.selection?.validatedAt),
  }
}
