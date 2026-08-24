import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Download, Heart, X } from 'lucide-react'
import type { Photo } from '../lib/galleries'

type Props = {
  photos: Photo[]
  index: number
  favorites: Set<string>
  downloadEnabled: boolean
  /** Apercu photographe : on regarde, on ne touche pas. */
  readOnly?: boolean
  onClose: () => void
  onNavigate: (index: number) => void
  onToggleFavorite: (photoId: string) => void
  onDownload: (photo: Photo) => void
}

export default function Lightbox({
  photos,
  index,
  favorites,
  downloadEnabled,
  readOnly = false,
  onClose,
  onNavigate,
  onToggleFavorite,
  onDownload,
}: Props) {
  const reduce = useReducedMotion()
  const photo = photos[index]
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  const goPrev = useCallback(() => {
    onNavigate((index - 1 + photos.length) % photos.length)
  }, [index, photos.length, onNavigate])

  const goNext = useCallback(() => {
    onNavigate((index + 1) % photos.length)
  }, [index, photos.length, onNavigate])

  // Navigation clavier + verrouillage du scroll de fond
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') goPrev()
      if (event.key === 'ArrowRight') goNext()
    }

    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, goPrev, goNext])

  // Nouvelle photo : on remet l'etat de chargement a zero
  useEffect(() => setLoaded(false), [index])

  // Prechargement des voisines pour une navigation sans attente
  useEffect(() => {
    const neighbours = [
      photos[(index + 1) % photos.length],
      photos[(index - 1 + photos.length) % photos.length],
    ]
    neighbours.forEach((next) => {
      if (!next) return
      const img = new Image()
      img.src = next.src
    })
  }, [index, photos])

  if (!photo) return null

  const isFavorite = favorites.has(photo.id)

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950/97"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return
        const delta = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(delta) > 60) {
          if (delta > 0) goPrev()
          else goNext()
        }
        touchStartX.current = null
      }}
    >
      {/* Barre d'actions */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white/80 md:px-6">
        <span className="text-sm tabular-nums">
          {index + 1} sur {photos.length}
        </span>

        <div className="flex items-center gap-1">
          {!readOnly && (
            <button
              type="button"
              onClick={() => onToggleFavorite(photo.id)}
              aria-pressed={isFavorite}
              aria-label={
                isFavorite ? 'Retirer de la sélection' : 'Ajouter à la sélection'
              }
              className={`grid size-11 place-items-center rounded-full transition hover:bg-white/10
                          ${isFavorite ? 'text-rose-400' : 'text-white/80'}`}
            >
              <Heart
                aria-hidden
                className="size-5"
                strokeWidth={1.75}
                fill={isFavorite ? 'currentColor' : 'none'}
              />
            </button>
          )}

          {downloadEnabled && (
            <button
              type="button"
              onClick={() => onDownload(photo)}
              aria-label="Télécharger cette photo"
              className="grid size-11 place-items-center rounded-full text-white/80 transition hover:bg-white/10"
            >
              <Download aria-hidden className="size-5" strokeWidth={1.75} />
            </button>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer la visionneuse"
            className="grid size-11 place-items-center rounded-full text-white/80 transition hover:bg-white/10"
          >
            <X aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 md:px-16">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Photo précédente"
          className="absolute left-1 z-10 grid size-12 place-items-center rounded-full text-white/70
                     transition hover:bg-white/10 hover:text-white md:left-3"
        >
          <ChevronLeft aria-hidden className="size-7" strokeWidth={1.5} />
        </button>

        {!loaded && (
          <div
            aria-hidden
            className="absolute size-10 animate-spin rounded-full border-2 border-white/25 border-t-white/80"
          />
        )}

        <AnimatePresence mode="wait">
          <motion.img
            key={photo.id}
            src={photo.src}
            alt={photo.alt}
            onLoad={() => setLoaded(true)}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: loaded ? 1 : 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="max-h-full max-w-full object-contain"
          />
        </AnimatePresence>

        <button
          type="button"
          onClick={goNext}
          aria-label="Photo suivante"
          className="absolute right-1 z-10 grid size-12 place-items-center rounded-full text-white/70
                     transition hover:bg-white/10 hover:text-white md:right-3"
        >
          <ChevronRight aria-hidden className="size-7" strokeWidth={1.5} />
        </button>
      </div>
    </motion.div>
  )
}
