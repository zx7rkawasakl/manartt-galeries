import { useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'

export default function NotFound() {
  useEffect(() => {
    document.documentElement.setAttribute('data-surface', 'light')
    return () => document.documentElement.removeAttribute('data-surface')
  }, [])

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 font-sans">
      <div className="text-center">
        <h1 className="text-2xl text-ink">Page introuvable</h1>
        <p className="mt-3 text-ink-soft">
          Le lien que vous avez suivi ne mène nulle part.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-ink px-6 py-3.5
                     text-paper transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98]"
        >
          <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
          Retour à l'accueil
        </Link>
      </div>
    </main>
  )
}
