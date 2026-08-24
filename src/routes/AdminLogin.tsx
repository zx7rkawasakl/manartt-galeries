import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { authErrorMessage, currentUser, signIn } from '../lib/auth'
import logo from '../assets/logo-manartt-white.png'

export default function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-surface', 'light')
    return () => document.documentElement.removeAttribute('data-surface')
  }, [])

  // Deja connectee : on ne repasse pas par le formulaire.
  useEffect(() => {
    let cancelled = false
    currentUser().then((user) => {
      if (!cancelled && user) navigate('/admin', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-12 font-sans">
      <div className="w-full max-w-sm">
        <img
          src={logo}
          alt="man.artt"
          width={128}
          height={64}
          className="h-auto w-28 [filter:invert(1)]"
        />

        <h1 className="mt-8 text-2xl tracking-tight text-ink">Espace photographe</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Connectez-vous pour gérer vos galeries.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Adresse mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-ink/20 bg-white px-4 py-3 text-ink
                         placeholder:text-ink-faint transition-colors
                         hover:border-ink/35 focus:border-ink/60"
              placeholder="vous@exemple.fr"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-ink">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
              className="rounded-xl border border-ink/20 bg-white px-4 py-3 text-ink
                         transition-colors hover:border-ink/35 focus:border-ink/60"
            />
          </div>

          {error && (
            <p id="login-error" role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3.5
                       text-paper transition-transform duration-150
                       hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
          >
            {loading && (
              <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
            )}
            {loading ? 'Connexion' : 'Se connecter'}
          </button>
        </form>

        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
          Retour à l'accueil
        </Link>
      </div>
    </main>
  )
}
