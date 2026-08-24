import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Star, X } from 'lucide-react'
import { REVIEW_URL } from '../lib/review'
import logo from '../assets/logo-manartt-white.png'

type Props = {
  /** Prenom ou nom du client, quand il est renseigne */
  clientName: string
  onClose: () => void
  /** Le client part laisser son avis : on ne le relancera plus. */
  onReviewed: () => void
}

/**
 * Invitation a laisser un avis, ouverte apres le telechargement de la galerie.
 *
 * Le moment est choisi : le client vient de recevoir ses photos, c'est la
 * seule seconde ou il a ses images en tete et rien d'autre a faire.
 */
export default function ReviewPrompt({ clientName, onClose, onReviewed }: Props) {
  const reduce = useReducedMotion()
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    linkRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const hello = clientName.trim() ? `${clientName.trim().split(' ')[0]}, ` : ''

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-0 z-[60] grid place-items-center bg-neutral-950/55 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avis-titre"
        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        // Le clic sur la carte ne doit pas fermer la fenetre.
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-paper p-8 text-center
                   shadow-[0_24px_80px_rgba(28,26,23,0.35)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full
                     text-ink-faint transition-colors hover:bg-paper-soft hover:text-ink"
        >
          <X aria-hidden className="size-4" strokeWidth={1.75} />
        </button>

        <img
          src={logo}
          alt="man.artt"
          width={96}
          height={48}
          className="mx-auto h-auto w-24 [filter:invert(1)]"
        />

        <div aria-hidden className="mt-6 flex justify-center gap-1 text-accent-deep">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.3 }}
            >
              <Star className="size-5" strokeWidth={1.5} fill="currentColor" />
            </motion.span>
          ))}
        </div>

        <h2 id="avis-titre" className="mt-5 text-2xl tracking-tight text-ink">
          Vos photos sont à vous
        </h2>

        <p className="mt-3 leading-relaxed text-ink-soft">
          {hello}si ces images vous ont plu, quelques mots sur Google aident
          beaucoup à faire connaître mon travail. Merci du fond du cœur.
        </p>

        <a
          ref={linkRef}
          href={REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onReviewed}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink
                     px-6 py-3.5 text-paper transition-transform duration-150
                     hover:bg-ink/90 active:scale-[0.98]"
        >
          <Star aria-hidden className="size-4" strokeWidth={1.75} />
          Laisser un avis Google
        </a>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-2xl px-6 py-3 text-sm text-ink-soft
                     transition-colors hover:text-ink"
        >
          Une autre fois
        </button>
      </motion.div>
    </motion.div>
  )
}
