/* ==================================================================
   AVIS GOOGLE
   ------------------------------------------------------------------
   Le message qui invite a laisser un avis s'ouvre apres que le client
   a telecharge sa galerie. Voir components/ReviewPrompt.tsx.
   ================================================================== */

/**
 * Lien vers lequel on envoie le client : la fiche man.artt, ouverte sur la
 * redaction d'un avis.
 *
 * Fourni par la photographe, recopie tel quel. Les parametres qui portent
 * l'intention sont `q`, `si` et `uds` ; le reste (`sxsrf`, `ved`, `sei`,
 * `biw`, `bih`) n'est que de la mesure d'audience Google.
 *
 * S'il cessait un jour de fonctionner, le remplacer par un lien frais :
 * fiche Google Business > « Demander des avis » > copier le lien.
 *
 * La variable d'environnement `VITE_GOOGLE_REVIEW_URL` a la priorite, pour
 * changer le lien sans retoucher au code.
 */
const DEFAULT_REVIEW_URL =
  'https://www.google.com/search?sca_esv=d7bb3ee0c0ddd2fe&sxsrf=APpeQns4e7EvcwhpVowpPeCD_9QC2b8gqg:1787260304591&q=manartt+photographe&si=APenkKm7iecQ4G6P-TsbSMFKIQtv3EFIqRAFw-i8uEbk55Z-_9oy8l46FTLRx3_BPTEBHX1NngB60a4b1hlbFTVJz3zkdtnpHecbTVpgax-L5Ci6sHjGovE%3D&uds=AJ5uw18zeF8z_P7IQbfeR8tV0KKTQk0XOWsiLeKlIwEWu_p4GsBfTDbECLJWQJfcv_MJCllJdP83Ba84mCuneBiL2cIgBaAd1w2-8W6xWkyD6VPgyrVjRIM&sa=X&sqi=2&ved=2ahUKEwjC3M28j7CWAxWTV6QEHQHCCc8Q3PALegQILhAF&biw=1920&bih=911&dpr=1&sei=u22Hao6vEJ2ykdUPxqeWoAo'

export const REVIEW_URL: string =
  import.meta.env.VITE_GOOGLE_REVIEW_URL || DEFAULT_REVIEW_URL

/**
 * Un client qui a deja suivi le lien n'est plus relance : le message ne doit
 * pas devenir un peage a chaque telechargement.
 */
function storageKey(code: string): string {
  return `manartt.review.${code}`
}

export function hasReviewed(code: string): boolean {
  try {
    return localStorage.getItem(storageKey(code)) !== null
  } catch {
    // Navigation privee, stockage refuse : au pire on repropose.
    return false
  }
}

export function markReviewed(code: string): void {
  try {
    localStorage.setItem(storageKey(code), new Date().toISOString())
  } catch {
    /* sans stockage, on se contente de ne pas insister dans cette session */
  }
}
