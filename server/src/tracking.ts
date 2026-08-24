import { prisma } from './db.js'

/* ==================================================================
   SUIVI DE LIVRAISON
   ------------------------------------------------------------------
   Une galerie envoyee est une galerie dont on ne sait plus rien. Ces
   deux marqueurs disent a la photographe si sa cliente a ouvert, et si
   elle est repartie avec ses photos.

   Le suivi ne doit jamais faire echouer la requete qu'il accompagne :
   mieux vaut une date manquante qu'un client qui ne peut pas telecharger.
   ================================================================== */

/** Premiere ouverture conservee, derniere ouverture rafraichie. */
export async function noteOpened(galleryId: string): Promise<void> {
  const now = new Date()
  try {
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: { firstOpenedAt: true },
    })
    if (!gallery) return

    await prisma.gallery.update({
      where: { id: galleryId },
      data: {
        lastOpenedAt: now,
        // `firstOpenedAt` ne bouge plus une fois pose : c'est la date de
        // reception, celle qui dit si la cliente a vu passer le lien.
        ...(gallery.firstOpenedAt ? {} : { firstOpenedAt: now }),
      },
    })
  } catch {
    /* le suivi n'est pas assez important pour interrompre une visite */
  }
}

export async function noteDownloaded(galleryId: string): Promise<void> {
  try {
    await prisma.gallery.update({
      where: { id: galleryId },
      data: { lastDownloadedAt: new Date() },
    })
  } catch {
    /* idem : jamais au prix du telechargement lui-meme */
  }
}
