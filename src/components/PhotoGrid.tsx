import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import type { Photo } from '../lib/galleries'

type Row = { photos: Photo[]; height: number }

/**
 * Rangees justifiees facon Pic-Time : chaque rangee est remplie jusqu'a la
 * largeur du conteneur, puis sa hauteur est ajustee pour que le total tombe
 * exactement juste. Les ratios d'origine sont preserves, aucun recadrage.
 */
function computeRows(
  photos: Photo[],
  width: number,
  targetHeight: number,
  gap: number,
): Row[] {
  if (width <= 0) return []

  const rows: Row[] = []
  let line: Photo[] = []
  let ratioSum = 0

  for (const photo of photos) {
    line.push(photo)
    ratioSum += photo.width / photo.height

    const gaps = (line.length - 1) * gap
    const height = (width - gaps) / ratioSum

    // La rangee est pleine : elle descend sous la hauteur visee.
    if (height <= targetHeight) {
      rows.push({ photos: line, height })
      line = []
      ratioSum = 0
    }
  }

  // Derniere rangee incomplete : on ne l'etire pas, sinon les dernieres
  // photos deviennent enormes.
  if (line.length > 0) {
    const gaps = (line.length - 1) * gap
    rows.push({
      photos: line,
      height: Math.min(targetHeight, (width - gaps) / ratioSum),
    })
  }

  return rows
}

type Props = {
  photos: Photo[]
  favorites: Set<string>
  onToggleFavorite: (photoId: string) => void
  onOpen: (index: number) => void
  /** Apercu photographe : on regarde, on ne touche pas. */
  readOnly?: boolean
}

export default function PhotoGrid({
  photos,
  favorites,
  onToggleFavorite,
  onOpen,
  readOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Mesure synchrone au montage : evite une frame de grille vide, et couvre
    // le cas ou le ResizeObserver ne se declenche pas (document non rendu, la
    // boucle de rendu etant suspendue, ses callbacks ne sont jamais livres).
    setWidth(el.getBoundingClientRect().width)

    // Puis ResizeObserver plutot qu'un listener resize : suit aussi les
    // changements de largeur qui ne viennent pas de la fenetre (zoom, sidebar).
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const gap = 8
  const targetHeight = width < 640 ? 200 : width < 1024 ? 260 : 320

  const rows = useMemo(
    () => computeRows(photos, width, targetHeight, gap),
    [photos, width, targetHeight],
  )

  // Index global, pour ouvrir la bonne photo dans la visionneuse
  let runningIndex = -1

  return (
    <div ref={containerRef} className="flex flex-col" style={{ gap }}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex" style={{ gap }}>
          {row.photos.map((photo) => {
            runningIndex += 1
            const index = runningIndex
            const isFavorite = favorites.has(photo.id)
            const photoWidth = row.height * (photo.width / photo.height)

            return (
              <figure
                key={photo.id}
                className="group relative overflow-hidden rounded-sm bg-paper-soft"
                style={{ width: photoWidth, height: row.height }}
              >
                <button
                  type="button"
                  onClick={() => onOpen(index)}
                  className="block h-full w-full cursor-zoom-in"
                  aria-label={`Agrandir ${photo.alt}`}
                >
                  <img
                    src={photo.thumb}
                    alt={photo.alt}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />
                </button>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(photo.id)}
                    aria-pressed={isFavorite}
                    aria-label={
                      isFavorite
                        ? `Retirer ${photo.alt} de la sélection`
                        : `Ajouter ${photo.alt} à la sélection`
                    }
                    className={`absolute right-2 top-2 grid size-9 place-items-center rounded-full
                                backdrop-blur-md transition
                                ${
                                  isFavorite
                                    ? 'bg-white text-rose-600 opacity-100'
                                    : 'bg-black/35 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                                }`}
                  >
                    <Heart
                      aria-hidden
                      className="size-[18px]"
                      strokeWidth={1.75}
                      fill={isFavorite ? 'currentColor' : 'none'}
                    />
                  </button>
                )}
              </figure>
            )
          })}
        </div>
      ))}
    </div>
  )
}
