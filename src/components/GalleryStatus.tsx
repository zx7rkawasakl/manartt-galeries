import type { GalleryWithStatus } from '../lib/galleries'

/* ==================================================================
   OU EN EST LA LIVRAISON
   ------------------------------------------------------------------
   Une galerie envoyee est une galerie dont on ne sait plus rien : ni si
   la cliente a ouvert, ni si elle est repartie avec ses photos. Ce
   composant repond a ca en une ligne, et c'est le seul endroit ou la
   formulation est decidee : la liste et la fiche disent la meme chose.
   ================================================================== */

type Tone = 'attente' | 'encours' | 'pret' | 'fini'

const DOT: Record<Tone, string> = {
  attente: 'bg-ink-faint',
  encours: 'bg-accent',
  pret: 'bg-accent-deep',
  fini: 'bg-emerald-600',
}

const TEXT: Record<Tone, string> = {
  attente: 'text-ink-faint',
  encours: 'text-ink-soft',
  pret: 'text-accent-deep',
  fini: 'text-emerald-700',
}

/** « 12 août », et l'annee en plus quand ce n'est pas cette annee. */
function day(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

type Stage = { tone: Tone; label: string }

function stageOf(gallery: GalleryWithStatus): Stage {
  if (!gallery.firstOpenedAt) {
    return {
      tone: 'attente',
      label: gallery.published ? 'Jamais ouverte' : 'Brouillon, pas encore envoyée',
    }
  }

  // Repartie avec ses photos : c'est la fin du parcours, quel que soit le type
  // de galerie.
  if (gallery.lastDownloadedAt) {
    return { tone: 'fini', label: `Téléchargée le ${day(gallery.lastDownloadedAt)}` }
  }

  const ouverte = `Ouverte le ${day(gallery.firstOpenedAt)}`

  // Sur une galerie complete, on s'arrete la : il n'y a pas de choix a suivre.
  if (!gallery.limitedSelection) {
    return { tone: 'encours', label: ouverte }
  }

  if (gallery.validatedAt) {
    return {
      tone: 'pret',
      label: `Sélection validée le ${day(gallery.validatedAt)}, pas encore téléchargée`,
    }
  }

  const { selectedCount, selectionLimit } = gallery
  return {
    tone: 'encours',
    label:
      selectedCount === 0
        ? `${ouverte}, aucune photo choisie`
        : `${ouverte}, ${selectedCount} sur ${selectionLimit} choisie${selectionLimit > 1 ? 's' : ''}`,
  }
}

type Props = {
  gallery: GalleryWithStatus
  /** Sur la fiche galerie : une seconde ligne pour la derniere visite. */
  detailed?: boolean
}

export default function GalleryStatus({ gallery, detailed = false }: Props) {
  const stage = stageOf(gallery)

  // Une seule visite : « revenue le… » repeterait la premiere ligne.
  const revenue =
    detailed &&
    gallery.lastOpenedAt &&
    gallery.firstOpenedAt &&
    day(gallery.lastOpenedAt) !== day(gallery.firstOpenedAt)
      ? day(gallery.lastOpenedAt)
      : null

  return (
    <div className="flex flex-col gap-1">
      <p className={`flex items-center gap-2 text-sm ${TEXT[stage.tone]}`}>
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[stage.tone]}`} />
        {stage.label}
      </p>
      {revenue && <p className="pl-3.5 text-xs text-ink-faint">Revenue le {revenue}</p>}
    </div>
  )
}
