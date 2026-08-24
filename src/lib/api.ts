/**
 * Client HTTP minimal partage par toute l'application.
 *
 * En developpement, Vite relaie `/api` vers le serveur : tout reste en
 * same-origin, donc les cookies partent sans configuration particuliere.
 * En production, definir VITE_API_URL si l'API vit sur un autre domaine.
 */
const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Prefixe une URL renvoyee par l'API (chemin relatif) pour l'usage direct. */
export function assetUrl(path: string): string {
  return `${BASE}${path}`
}

type Options = {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const isForm = options.body instanceof FormData

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      // Indispensable : toute l'authentification repose sur des cookies.
      credentials: 'include',
      headers: isForm || options.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
      body: isForm ? (options.body as FormData) : options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch {
    // Serveur injoignable, DNS, coupure reseau.
    throw new ApiError(0, 'network')
  }

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const code = (payload as { error?: string } | null)?.error ?? 'server_error'
    const message = (payload as { message?: string } | null)?.message
    throw new ApiError(response.status, code, message)
  }

  return payload as T
}
