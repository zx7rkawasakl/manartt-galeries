import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { currentUser, type Photographer } from '../lib/auth'

/**
 * Garde des routes photographe.
 *
 * Contrairement a la maquette, la reponse vient du serveur : le cookie de
 * session est httpOnly, illisible et infalsifiable depuis le navigateur.
 * Bloquer l'affichage ici n'est qu'un confort ; c'est l'API qui refuse
 * reellement les donnees.
 *
 * La session est recuperee une seule fois et partagee par le contexte, pour
 * que la coque et les pages ne redemandent pas chacune `/api/auth/me`.
 */
const SessionContext = createContext<Photographer | null>(null)

export function useSession(): Photographer | null {
  return useContext(SessionContext)
}

export default function AdminGuard() {
  const location = useLocation()
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking')
  const [user, setUser] = useState<Photographer | null>(null)

  useEffect(() => {
    let cancelled = false
    currentUser().then((found) => {
      if (cancelled) return
      setUser(found)
      setState(found ? 'in' : 'out')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'checking') {
    // Fond neutre plutot qu'un indicateur : la verification dure quelques
    // dizaines de millisecondes, un spinner ne ferait que clignoter.
    return <div className="min-h-dvh bg-paper" />
  }

  if (state === 'out') {
    return (
      <Navigate to="/admin/connexion" state={{ from: location.pathname }} replace />
    )
  }

  return (
    <SessionContext.Provider value={user}>
      <Outlet />
    </SessionContext.Provider>
  )
}
