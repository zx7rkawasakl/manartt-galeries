/* ==================================================================
   AUTORISATION DE DIFFUSION (DROIT A L'IMAGE)
   ------------------------------------------------------------------
   Le texte vit ici, et ici seulement. Il est renvoye au client pour
   affichage, puis recopie tel quel dans la reponse enregistree.

   Cette recopie n'est pas une redondance : c'est ce qui fait la valeur
   de la trace. Si le texte ci-dessous change un jour, les accords deja
   donnes doivent continuer de montrer ce a quoi les gens ont
   reellement consenti, pas ce qu'on affiche aujourd'hui.

   Toute modification du texte doit s'accompagner d'un changement de
   TERMS_VERSION.
   ================================================================== */

export const TERMS_VERSION = '2026-08-a'

export const TERMS_TEXT = `En donnant votre accord, vous autorisez man.artt à publier les photographies de cette séance :

• sur ses réseaux sociaux ;
• sur son site manartt.fr et dans son portfolio en ligne ;
• dans ses supports de présentation (books, salons, expositions).

Cette autorisation est consentie à titre gratuit, pour une durée de cinq ans, en France et sur Internet.

Elle ne permet ni la revente des images à des tiers, ni leur utilisation publicitaire par une autre entreprise, ni aucun usage portant atteinte à votre réputation ou à votre vie privée.

Si des personnes mineures figurent sur ces photographies, vous confirmez être titulaire de l'autorité parentale ou habilité à donner cet accord en leur nom.

Vous pouvez revenir sur votre décision à tout moment, depuis cette page ou en me contactant. Les publications déjà en ligne seront alors retirées dans un délai raisonnable.

Répondre « non » n'a aucune conséquence : votre galerie, vos photos et leur téléchargement restent identiques.`

/** Ce que le client recoit pour decider. */
export function terms() {
  return { version: TERMS_VERSION, text: TERMS_TEXT }
}
