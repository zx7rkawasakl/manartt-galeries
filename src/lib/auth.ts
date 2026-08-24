import { api, ApiError } from './api'

/* ==================================================================
   SESSION PHOTOGRAPHE
   ------------------------------------------------------------------
   L'authentification est desormais reelle et vit cote serveur :
   mot de passe hache (bcrypt), jeton signe depose dans un cookie
   httpOnly que le JavaScript ne peut pas lire.

   Rien ici ne « protege » quoi que ce soit par lui-meme : ces fonctions
   ne font qu'interroger le serveur, qui reste seul juge.
   ================================================================== */

export type Photographer = {
  id: string
  email: string
  name: string | null
}

export class AuthError extends Error {
  constructor(message = 'invalid_credentials') {
    super(message)
    this.name = 'AuthError'
  }
}

export async function signIn(email: string, password: string): Promise<Photographer> {
  try {
    const { user } = await api<{ user: Photographer }>('/api/auth/login', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
    })
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      throw new AuthError('too_many_requests')
    }
    throw new AuthError()
  }
}

export async function signOut(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
}

/**
 * Session courante, ou null.
 * C'est le serveur qui repond : impossible de se declarer connectee en
 * bidouillant le navigateur.
 */
export async function currentUser(): Promise<Photographer | null> {
  try {
    const { user } = await api<{ user: Photographer }>('/api/auth/me')
    return user
  } catch {
    return null
  }
}

/** Message affichable pour un echec de connexion. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError && error.message === 'too_many_requests') {
    return 'Trop de tentatives. Patientez quelques minutes.'
  }
  if (error instanceof ApiError && error.code === 'network') {
    return 'Serveur injoignable. Vérifiez que l’API est démarrée.'
  }
  return 'Identifiants incorrects.'
}
