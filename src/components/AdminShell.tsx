import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Images, LoaderCircle, LogOut, Shuffle, Sparkles } from 'lucide-react'
import { signOut } from '../lib/auth'
import { useSession } from './AdminGuard'
import logo from '../assets/logo-manartt-white.png'

type Props = {
  children: ReactNode
  /** Fil d'ariane optionnel, affiche a gauche du titre */
  back?: { to: string; label: string }
}

const NAV = [
  { to: '/admin', label: 'Galeries', icon: Images },
  { to: '/admin/story', label: 'Story', icon: Sparkles },
  { to: '/admin/tirage', label: 'Tirage au sort', icon: Shuffle },
]

export default function AdminShell({ children, back }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const session = useSession()
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-surface', 'light')
    return () => document.documentElement.removeAttribute('data-surface')
  }, [])

  return (
    <div className="min-h-dvh bg-paper font-sans text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-5">
            <Link to="/admin" className="flex items-center gap-3">
              <img
                src={logo}
                alt="man.artt"
                width={96}
                height={48}
                className="h-auto w-20 [filter:invert(1)]"
              />
            </Link>

            <nav aria-label="Espace photographe" className="flex items-center gap-1">
              {NAV.map((item) => {
                // `/admin/g/:id` fait partie des galeries : on compare la racine.
                const active =
                  item.to === '/admin'
                    ? location.pathname === '/admin' || location.pathname.startsWith('/admin/g/')
                    : location.pathname.startsWith(item.to)

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm
                                transition-colors ${
                                  active
                                    ? 'bg-paper-soft text-ink'
                                    : 'text-ink-soft hover:text-ink'
                                }`}
                  >
                    <item.icon aria-hidden className="size-4" strokeWidth={1.75} />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {session?.email && (
              <span className="hidden text-sm text-ink-soft md:inline">
                {session.email}
              </span>
            )}
            <button
              type="button"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true)
                // On attend la reponse : c'est le serveur qui invalide le
                // cookie, partir trop tot laisserait la session ouverte.
                await signOut()
                navigate('/admin/connexion', { replace: true })
              }}
              className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2
                         text-sm text-ink-soft transition-colors hover:border-ink/35 hover:text-ink
                         disabled:opacity-60"
            >
              {leaving ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
              )}
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {back && (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <Link
            to={back.to}
            className="text-sm text-ink-soft transition-colors hover:text-ink"
          >
            {back.label}
          </Link>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  )
}
