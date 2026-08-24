import { api } from './api'

/* ==================================================================
   TIRAGE AU SORT
   ------------------------------------------------------------------
   Le serveur garde la liste des participants ; le tirage se fait ici,
   la ou vit l'animation.
   ================================================================== */

export type Participant = {
  handle: string
  /** Nombre de participations : pondere les chances au tirage */
  entries: number
}

export async function listParticipants(): Promise<Participant[]> {
  const { participants } = await api<{ participants: Participant[] }>(
    '/api/contest/participants',
  )
  return participants
}

export async function saveParticipants(
  participants: Participant[],
): Promise<Participant[]> {
  const result = await api<{ participants: Participant[] }>(
    '/api/contest/participants',
    { method: 'PUT', body: { participants } },
  )
  return result.participants
}

export async function clearParticipants(): Promise<void> {
  await api('/api/contest/participants', { method: 'DELETE' })
}

/* --------------------------- Analyse du collage -------------------- */

/**
 * Lit une liste collee. Deux formats acceptes, melangeables :
 *
 *   pseudo,3          -> pseudo avec 3 participations
 *   pseudo            -> une participation ; repete, les lignes s'additionnent
 *
 * Le second correspond a ce qu'on obtient en copiant bruteent les auteurs
 * des commentaires : un pseudo par ligne, autant de fois qu'il a commente.
 */
export function parseList(raw: string): Participant[] {
  const totals = new Map<string, number>()

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const [rawHandle, rawCount] = trimmed.split(/[,;\t]/)
    const handle = (rawHandle ?? '').trim().replace(/^@+/, '')
    if (!handle) continue

    const parsed = rawCount !== undefined ? Number.parseInt(rawCount.trim(), 10) : 1
    const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 1

    totals.set(handle, (totals.get(handle) ?? 0) + count)
  }

  return [...totals]
    .map(([handle, entries]) => ({ handle, entries }))
    .sort((a, b) => b.entries - a.entries || a.handle.localeCompare(b.handle))
}

export function serializeList(participants: Participant[]): string {
  return participants.map((p) => `${p.handle},${p.entries}`).join('\n')
}

/* ------------------------------ Tirage ----------------------------- */

/**
 * Entier aleatoire dans [0, max[, sans biais.
 *
 * `crypto.getRandomValues` plutot que `Math.random` : pour un concours dote
 * de vrais lots, la source doit etre solide. Le rejet des valeurs au-dela du
 * plus grand multiple de `max` evite le biais modulo, qui favoriserait
 * legerement les premiers participants.
 */
function randomBelow(max: number): number {
  if (max <= 0) return 0
  const limit = Math.floor(0xffffffff / max) * max
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]!
  } while (value >= limit)
  return value % max
}

export type DrawMode = 'weighted' | 'equal'

/**
 * Tire `count` gagnants distincts.
 *
 * En mode pondere, chaque participation compte : quelqu'un qui a commente
 * cinq fois a cinq fois plus de chances. Un gagnant est retire du tirage
 * suivant, personne ne peut gagner deux lots.
 */
export function drawWinners(
  participants: Participant[],
  count: number,
  mode: DrawMode,
): Participant[] {
  const pool = [...participants]
  const winners: Participant[] = []
  const wanted = Math.min(count, pool.length)

  for (let i = 0; i < wanted; i += 1) {
    let index = 0

    if (mode === 'equal') {
      index = randomBelow(pool.length)
    } else {
      const total = pool.reduce((sum, p) => sum + p.entries, 0)
      let ticket = randomBelow(total)
      index = pool.findIndex((p) => {
        ticket -= p.entries
        return ticket < 0
      })
      if (index < 0) index = pool.length - 1
    }

    const [winner] = pool.splice(index, 1)
    if (winner) winners.push(winner)
  }

  return winners
}
