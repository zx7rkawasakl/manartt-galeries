import { useEffect, useState } from 'react'
import { HardDrive } from 'lucide-react'
import { getStorage, type Storage } from '../lib/galleries'

/* ==================================================================
   OCCUPATION DU DISQUE
   ------------------------------------------------------------------
   Le disque plein est la seule panne qui ne previent pas : l'import
   echoue au milieu d'une seance, sans raison visible. Cette jauge
   existe pour que ca n'arrive jamais par surprise.

   Elle reste discrete tant qu'il y a de la place, et ne se fait voir
   qu'a partir du moment ou il faut agir.
   ================================================================== */

const GO = 1024 ** 3

/** « 3,2 Go », « 480 Mo » — l'unite suit la taille. */
function poids(bytes: number): string {
  if (bytes >= GO) {
    return `${(bytes / GO).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`
  }
  const mo = bytes / 1024 ** 2
  return `${mo.toLocaleString('fr-FR', { maximumFractionDigits: mo < 10 ? 1 : 0 })} Mo`
}

type Level = 'calme' | 'attention' | 'critique'

function levelOf(ratio: number): Level {
  if (ratio >= 0.9) return 'critique'
  if (ratio >= 0.75) return 'attention'
  return 'calme'
}

const BAR: Record<Level, string> = {
  calme: 'bg-ink/70',
  attention: 'bg-amber-500',
  critique: 'bg-rose-600',
}

const FRAME: Record<Level, string> = {
  calme: 'border-ink/10 bg-white',
  attention: 'border-amber-300 bg-amber-50',
  critique: 'border-rose-300 bg-rose-50',
}

export default function StorageGauge() {
  const [storage, setStorage] = useState<Storage | null>(null)

  useEffect(() => {
    let cancelled = false
    // Un echec ici ne doit rien casser : la jauge est un confort, pas une
    // condition d'affichage des galeries.
    getStorage()
      .then((value) => {
        if (!cancelled) setStorage(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!storage || storage.quotaBytes <= 0) return null

  const ratio = Math.min(1, storage.usedBytes / storage.quotaBytes)
  const level = levelOf(ratio)
  const reste = Math.max(0, storage.quotaBytes - storage.usedBytes)

  // Estimation en seances, calibree sur la plus grosse galerie : c'est le
  // chiffre prudent, celui qui ne promet pas de la place inexistante.
  const seances =
    storage.largestGalleryBytes > 0
      ? Math.floor(reste / storage.largestGalleryBytes)
      : null

  return (
    <section
      aria-labelledby="stockage-titre"
      className={`rounded-2xl border p-5 transition-colors ${FRAME[level]}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="stockage-titre" className="flex items-center gap-2 text-sm font-medium text-ink">
          <HardDrive aria-hidden className="size-4 text-ink-soft" strokeWidth={1.75} />
          Stockage
        </h2>
        <p className="text-sm text-ink-soft">
          <span className="text-ink">{poids(storage.usedBytes)}</span> sur{' '}
          {poids(storage.quotaBytes)}
        </p>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Espace disque utilisé"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${BAR[level]}`}
          style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 1.5 : 0)}%` }}
        />
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
        {level === 'critique' ? (
          <span className="text-rose-700">
            Il ne reste que {poids(reste)}. Supprimez des galeries déjà livrées
            avant votre prochain import, sinon il échouera en cours de route.
          </span>
        ) : level === 'attention' ? (
          <span className="text-amber-900">
            Il reste {poids(reste)}
            {seances !== null && seances > 0
              ? `, soit environ ${seances} séance${seances > 1 ? 's' : ''} de la taille de la plus grosse.`
              : '.'}{' '}
            Pensez à faire le ménage dans les galeries livrées.
          </span>
        ) : (
          <>
            Il reste {poids(reste)}
            {seances !== null && seances > 0
              ? `, soit environ ${seances} séance${seances > 1 ? 's' : ''} de la taille de votre plus grosse galerie.`
              : '.'}
          </>
        )}
      </p>
    </section>
  )
}
