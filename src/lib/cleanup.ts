/**
 * Efface les donnees laissees par la maquette (avant l'arrivee du back-end).
 *
 * Plus rien ne les lit, mais les photos importees a l'epoque dorment encore
 * dans IndexedDB et peuvent peser plusieurs centaines de megaoctets sur le
 * disque du visiteur. On les retire une bonne fois.
 *
 * Ce module pourra disparaitre une fois tous les navigateurs passes.
 */
const DONE_KEY = 'manartt:legacy-cleared'

export function clearLegacyStorage(): void {
  if (localStorage.getItem(DONE_KEY)) return

  try {
    localStorage.removeItem('manartt:galleries')
    // Favoris de la maquette : une cle par galerie.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('manartt:fav:')) localStorage.removeItem(key)
    }
    sessionStorage.removeItem('manartt:session')

    // Base des fichiers photo de la maquette.
    indexedDB.deleteDatabase('manartt')

    localStorage.setItem(DONE_KEY, '1')
  } catch {
    // Un stockage indisponible (navigation privee stricte) ne doit pas
    // empecher l'application de demarrer.
  }
}
