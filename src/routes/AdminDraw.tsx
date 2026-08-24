import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, LoaderCircle, Search, Shuffle, Trash2, Users } from 'lucide-react'
import AdminShell from '../components/AdminShell'
import Confetti, { type ConfettiHandle } from '../components/Confetti'
import {
  clearParticipants,
  drawWinners,
  listParticipants,
  parseList,
  saveParticipants,
  serializeList,
  type DrawMode,
  type Participant,
} from '../lib/contest'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function AdminDraw() {
  const reduce = useReducedMotion()
  const confetti = useRef<ConfettiHandle>(null)

  const [participants, setParticipants] = useState<Participant[] | null>(null)
  const [search, setSearch] = useState('')

  const [winnerCount, setWinnerCount] = useState(5)
  const [mode, setMode] = useState<DrawMode>('weighted')
  const [winners, setWinners] = useState<Participant[]>([])
  const [drawing, setDrawing] = useState(false)
  const [spinning, setSpinning] = useState<string[]>([])

  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    listParticipants().then((list) => {
      setParticipants(list)
      setDraft(serializeList(list))
    })
  }, [])

  const totalEntries = useMemo(
    () => (participants ?? []).reduce((sum, p) => sum + p.entries, 0),
    [participants],
  )

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return participants ?? []
    return (participants ?? []).filter((p) => p.handle.toLowerCase().includes(needle))
  }, [participants, search])

  const winnerHandles = useMemo(() => new Set(winners.map((w) => w.handle)), [winners])

  /* ------------------------------ Tirage ----------------------------- */

  async function runDraw() {
    const list = participants ?? []
    if (list.length === 0) return

    setDrawing(true)
    setWinners([])

    // Les gagnants sont tires d'un coup, avant l'animation : celle-ci ne fait
    // que reveler un resultat deja arrete, elle ne l'influence pas.
    const result = drawWinners(list, winnerCount, mode)

    for (const [index, winner] of result.entries()) {
      if (!reduce) {
        // Defilement de pseudos au hasard, purement decoratif.
        for (let i = 0; i < 12; i += 1) {
          const random = list[Math.floor(Math.random() * list.length)]
          setSpinning((current) => {
            const next = [...current]
            next[index] = random?.handle ?? ''
            return next
          })
          await wait(45 + i * 14)
        }
      }

      setSpinning((current) => {
        const next = [...current]
        next[index] = ''
        return next
      })
      setWinners((current) => [...current, winner])
      confetti.current?.burst()
      if (!reduce) await wait(450)
    }

    setDrawing(false)
  }

  /* ---------------------------- Liste -------------------------------- */

  async function applyDraft() {
    setSaving(true)
    try {
      const list = await saveParticipants(parseList(draft))
      setParticipants(list)
      setDraft(serializeList(list))
      setWinners([])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function resetAll() {
    const sure = window.confirm(
      'Effacer toute la liste des participants ? Cette action est irréversible.',
    )
    if (!sure) return
    await clearParticipants()
    setParticipants([])
    setDraft('')
    setWinners([])
  }

  const ready = participants !== null
  const empty = ready && participants.length === 0

  return (
    <AdminShell back={{ to: '/admin', label: 'Retour aux galeries' }}>
      <Confetti ref={confetti} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight">Tirage au sort</h1>
          <p className="mt-2 text-ink-soft">
            {!ready
              ? 'Chargement'
              : empty
                ? 'Aucun participant pour le moment'
                : `${participants.length} participant${participants.length > 1 ? 's' : ''} · ${totalEntries} participation${totalEntries > 1 ? 's' : ''}`}
          </p>
        </div>

        {!empty && ready && (
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2
                       text-sm text-ink-soft transition-colors hover:border-rose-300 hover:text-rose-700"
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            Vider la liste
          </button>
        )}
      </div>

      {/* ------------------------- Etat vide ------------------------- */}
      {empty && (
        <div className="mt-10 rounded-2xl border border-dashed border-ink/15 p-10 text-center">
          <Users aria-hidden className="mx-auto size-8 text-ink-soft" strokeWidth={1.5} />
          <p className="mt-4 text-ink-soft">
            Collez la liste des participants pour lancer un tirage.
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm text-paper
                       transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98]"
          >
            Ajouter des participants
          </button>
        </div>
      )}

      {!empty && ready && (
        <div className="mt-10 grid gap-8 lg:grid-cols-[320px_1fr]">
          {/* --------------------- Liste ---------------------- */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                strokeWidth={1.75}
              />
              <label htmlFor="search-participant" className="sr-only">
                Rechercher un participant
              </label>
              <input
                id="search-participant"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un pseudo"
                className="w-full rounded-xl border border-ink/20 bg-white py-2.5 pl-9 pr-3 text-sm
                           text-ink placeholder:text-ink-faint transition-colors
                           hover:border-ink/35 focus:border-ink/60"
              />
            </div>

            <ul className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-ink/10 bg-white">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-ink-soft">
                  Aucun participant trouvé.
                </li>
              ) : (
                filtered.map((participant) => {
                  const won = winnerHandles.has(participant.handle)
                  return (
                    <li
                      key={participant.handle}
                      className={`flex items-center justify-between gap-3 border-b border-ink/5 px-4 py-2.5
                                  text-sm last:border-b-0 ${won ? 'bg-accent-wash' : ''}`}
                    >
                      <span
                        className={`truncate ${won ? 'font-medium text-accent-deep' : ''}`}
                      >
                        @{participant.handle}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                          won
                            ? 'bg-accent-deep text-paper'
                            : 'bg-paper-soft text-ink-soft'
                        }`}
                      >
                        {participant.entries}
                      </span>
                    </li>
                  )
                })
              )}
            </ul>

            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="mt-3 text-sm text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {editing ? 'Masquer la liste' : 'Modifier la liste'}
            </button>
          </aside>

          {/* --------------------- Tirage --------------------- */}
          <section>
            <div className="flex flex-wrap items-end gap-6 rounded-2xl border border-ink/10 bg-white p-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="winner-count" className="text-sm font-medium">
                  Gagnants
                </label>
                <input
                  id="winner-count"
                  type="number"
                  min={1}
                  max={Math.max(1, participants.length)}
                  value={winnerCount}
                  onChange={(e) => setWinnerCount(Number(e.target.value) || 1)}
                  className="w-24 rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-ink
                             transition-colors hover:border-ink/35 focus:border-ink/60"
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Mode</span>
                <div className="flex rounded-full border border-ink/15 bg-paper-soft p-1">
                  {(
                    [
                      ['weighted', 'Pondéré'],
                      ['equal', 'Équitable'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      aria-pressed={mode === value}
                      className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                        mode === value ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={runDraw}
                disabled={drawing}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3
                           text-sm text-paper transition-transform duration-150
                           hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
              >
                {drawing ? (
                  <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Shuffle aria-hidden className="size-4" strokeWidth={1.75} />
                )}
                {drawing ? 'Tirage' : 'Lancer le tirage'}
              </button>
            </div>

            <p className="mt-3 text-xs text-ink-soft">
              {mode === 'weighted'
                ? 'Chaque participation compte : cinq commentaires donnent cinq fois plus de chances.'
                : 'Chaque personne a exactement les mêmes chances, quel que soit son nombre de commentaires.'}{' '}
              Une même personne ne peut pas gagner deux fois.
            </p>

            {/* Revelation */}
            <div className="mt-8 flex flex-col gap-3" aria-live="polite">
              {winners.length === 0 && spinning.length === 0 && !drawing && (
                <p className="rounded-2xl border border-dashed border-ink/15 py-14 text-center text-sm text-ink-soft">
                  Aucun tirage lancé pour le moment.
                </p>
              )}

              {Array.from({ length: Math.max(winners.length, drawing ? winnerCount : 0) }).map(
                (_, index) => {
                  const winner = winners[index]
                  const rolling = spinning[index]

                  if (!winner && !rolling) return null

                  return (
                    <motion.div
                      key={index}
                      initial={reduce ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className={`flex items-center justify-between gap-4 rounded-xl border px-6 py-5 ${
                        winner
                          ? 'border-accent/45 bg-accent-wash'
                          : 'border-ink/10 bg-paper-soft'
                      }`}
                    >
                      <span className="w-24 shrink-0 text-sm text-ink-soft">
                        Gagnant {index + 1}
                      </span>
                      <span
                        className={`flex-1 text-xl font-medium tracking-tight ${
                          winner ? 'text-accent-deep' : 'text-ink-faint'
                        }`}
                      >
                        @{winner?.handle ?? rolling}
                      </span>
                      {winner && (
                        <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                          {winner.entries} participation{winner.entries > 1 ? 's' : ''}
                        </span>
                      )}
                    </motion.div>
                  )
                },
              )}
            </div>
          </section>
        </div>
      )}

      {/* ------------------------ Edition ------------------------ */}
      {(editing || empty) && (
        <section className="mt-12 border-t border-ink/10 pt-8">
          <h2 className="text-lg tracking-tight">Liste des participants</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Un participant par ligne. Deux écritures possibles, mélangeables :
            <code className="mx-1 rounded bg-paper-soft px-1.5 py-0.5">pseudo,3</code>
            pour trois participations, ou simplement
            <code className="mx-1 rounded bg-paper-soft px-1.5 py-0.5">pseudo</code>
            répété autant de fois qu'il a commenté. L'arobase est facultative.
          </p>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder={'clarissebbnt_,11\nlea_rambaud,10\nmeg.p'}
            className="mt-4 min-h-56 w-full rounded-xl border border-ink/20 bg-white p-4
                       font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint
                       transition-colors hover:border-ink/35 focus:border-ink/60"
          />

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={applyDraft}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm text-paper
                         transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98]
                         disabled:opacity-60"
            >
              {saving && (
                <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
              )}
              Enregistrer la liste
            </button>

            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                <Check aria-hidden className="size-4" strokeWidth={2} />
                Enregistré
              </span>
            )}

            <span className="text-sm text-ink-soft">
              {parseList(draft).length} participant
              {parseList(draft).length > 1 ? 's' : ''} détecté
              {parseList(draft).length > 1 ? 's' : ''}
            </span>
          </div>
        </section>
      )}
    </AdminShell>
  )
}
