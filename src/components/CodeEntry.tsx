import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { openGallery, accessErrorMessage } from '../lib/galleries'

type Status = 'idle' | 'loading' | 'error'

export default function CodeEntry() {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!code.trim()) {
      setStatus('error')
      setError('Merci de saisir le code de votre galerie.')
      return
    }

    setStatus('loading')
    setError(null)

    try {
      const gallery = await openGallery(code)
      navigate(`/g/${encodeURIComponent(gallery.code)}`)
    } catch (err) {
      setStatus('error')
      setError(accessErrorMessage(err))
    }
  }

  const loading = status === 'loading'

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
      className="mt-10 w-full max-w-md"
    >
      <form onSubmit={handleSubmit} noValidate>
        <label
          htmlFor="gallery-code"
          className="block text-sm font-medium tracking-wide text-white/85"
        >
          Code de votre galerie
        </label>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id="gallery-code"
            name="code"
            type="text"
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={loading}
            aria-invalid={status === 'error'}
            aria-describedby={error ? 'code-error' : 'code-help'}
            onChange={(e) => {
              setCode(e.target.value)
              if (status === 'error') {
                setStatus('idle')
                setError(null)
              }
            }}
            placeholder="Ex. MARIN0726"
            className="w-full flex-1 rounded-2xl border border-white/25 bg-white/10 px-5 py-4
                       text-base text-white placeholder:text-white/55 backdrop-blur-md
                       transition-colors duration-200
                       hover:border-white/40 focus:border-white/70 focus:bg-white/15
                       disabled:cursor-not-allowed disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl
                       bg-white px-6 py-4 text-base font-medium text-neutral-950
                       transition-transform duration-150
                       hover:bg-white/90 active:scale-[0.98]
                       disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <LoaderCircle aria-hidden className="size-5 animate-spin" strokeWidth={1.75} />
                Ouverture
              </>
            ) : (
              <>
                Ouvrir
                <ArrowRight aria-hidden className="size-5" strokeWidth={1.75} />
              </>
            )}
          </button>
        </div>

        {error ? (
          <p
            id="code-error"
            role="alert"
            className="mt-3 text-sm text-rose-200"
          >
            {error}
          </p>
        ) : (
          <p id="code-help" className="mt-3 text-sm text-white/65">
            Le code figure dans le mail de livraison de vos photos.
          </p>
        )}
      </form>
    </motion.div>
  )
}
