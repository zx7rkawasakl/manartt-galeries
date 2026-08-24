import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Images, Link2, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react'
import AdminShell from '../components/AdminShell'
import GalleryStatus from '../components/GalleryStatus'
import StorageGauge from '../components/StorageGauge'
import {
  createGallery,
  generateCode,
  listGalleries,
  type GalleryWithStatus,
} from '../lib/galleries'
import { ApiError } from '../lib/api'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function isExpired(gallery: GalleryWithStatus) {
  return gallery.expiresAt !== null && new Date(gallery.expiresAt) < new Date()
}

export default function AdminDashboard() {
  const reduce = useReducedMotion()
  const [galleries, setGalleries] = useState<GalleryWithStatus[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    listGalleries().then(setGalleries)
  }, [])

  async function copyLink(code: string) {
    const url = `${location.origin}/g/${code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Lien à copier', url)
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight">Vos galeries</h1>
          <p className="mt-2 text-ink-soft">
            {galleries === null
              ? 'Chargement'
              : `${galleries.length} galerie${galleries.length > 1 ? 's' : ''}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm text-paper
                     transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98]"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2} />
          Nouvelle galerie
        </button>
      </div>

      <div className="mt-8">
        <StorageGauge />
      </div>

      {/* Liste */}
      <div className="mt-8">
        {galleries === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-paper-soft" />
            ))}
          </div>
        ) : galleries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/15 py-20 text-center">
            <Images aria-hidden className="mx-auto size-8 text-ink-soft" strokeWidth={1.5} />
            <p className="mt-4 text-ink-soft">Aucune galerie pour le moment.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {galleries.map((gallery) => (
              <li
                key={gallery.id}
                className="rounded-2xl border border-ink/10 bg-white p-5 transition-colors hover:border-ink/25"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/admin/g/${gallery.id}`}
                        className="text-lg tracking-tight underline-offset-4 hover:underline"
                      >
                        {gallery.title}
                      </Link>

                      {!gallery.published && (
                        <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-xs text-ink-soft">
                          Brouillon
                        </span>
                      )}
                      {isExpired(gallery) && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-900">
                          Expirée
                        </span>
                      )}
                    </div>

                    {/* Le nom du client est facultatif : on ne laisse pas de
                        separateur orphelin quand il manque. */}
                    <p className="mt-1 text-sm text-ink-soft">
                      {[
                        gallery.clientName,
                        formatDate(gallery.shotAt),
                        `${gallery.photos.length} photo${gallery.photos.length > 1 ? 's' : ''}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>

                    {/* Ou en est la cliente : la seule chose qu'on ne pouvait
                        pas savoir sans aller voir. */}
                    <div className="mt-2">
                      <GalleryStatus gallery={gallery} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="rounded-lg bg-paper-soft px-3 py-2 font-mono text-sm tracking-wider">
                      {gallery.code}
                    </code>

                    <button
                      type="button"
                      onClick={() => copyLink(gallery.code)}
                      aria-label={`Copier le lien client de ${gallery.title}`}
                      className="grid size-10 place-items-center rounded-full border border-ink/15
                                 text-ink-soft transition-colors hover:border-ink/35 hover:text-ink"
                    >
                      {copied === gallery.code ? (
                        <Check aria-hidden className="size-4 text-emerald-600" strokeWidth={2} />
                      ) : (
                        <Link2 aria-hidden className="size-4" strokeWidth={1.75} />
                      )}
                    </button>

                    <Link
                      to={`/admin/g/${gallery.id}`}
                      className="rounded-full bg-ink px-4 py-2.5 text-sm text-paper transition-transform
                                 duration-150 hover:bg-ink/90 active:scale-[0.98]"
                    >
                      Gérer
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <CreateGalleryDialog
          reduce={reduce ?? false}
          onCancel={() => setCreating(false)}
          onCreated={(gallery) => {
            setGalleries((current) => [gallery, ...(current ?? [])])
            setCreating(false)
          }}
        />
      )}
    </AdminShell>
  )
}

/* ------------------------------------------------------------------ */

function CreateGalleryDialog({
  reduce,
  onCancel,
  onCreated,
}: {
  reduce: boolean
  onCancel: () => void
  onCreated: (gallery: GalleryWithStatus) => void
}) {
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [code, setCode] = useState(generateCode)
  const [shotAt, setShotAt] = useState(todayIso)
  const [expiresAt, setExpiresAt] = useState('')
  const [downloadEnabled, setDownloadEnabled] = useState(true)
  const [published, setPublished] = useState(true)
  const [limitedSelection, setLimitedSelection] = useState(false)
  const [selectionLimit, setSelectionLimit] = useState(10)
  const [imageConsentRequested, setImageConsentRequested] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onCancel])

  // L'unicite du code est tranchee par le serveur (contrainte en base) : lui
  // seul voit toutes les galeries, et lui seul est a l'abri d'une course entre
  // deux creations simultanees.
  const [codeTaken, setCodeTaken] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('Donnez un nom à la galerie.')
      return
    }

    setSaving(true)
    setCodeTaken(false)
    setError(null)
    try {
      const gallery = await createGallery({
        title,
        clientName,
        code,
        shotAt,
        expiresAt: expiresAt || null,
        downloadEnabled,
        published,
        limitedSelection,
        selectionLimit,
        imageConsentRequested,
      })
      onCreated(gallery)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'code_taken') {
        setCodeTaken(true)
        setError('Ce code est déjà utilisé par une autre galerie.')
      } else {
        setError(err instanceof ApiError && err.message ? err.message : 'Création impossible.')
      }
      setSaving(false)
    }
  }

  const field =
    'rounded-xl border border-ink/20 bg-white px-4 py-3 text-ink placeholder:text-ink-faint ' +
    'transition-colors hover:border-ink/35 focus:border-ink/60'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 py-10">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-gallery-title"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-lg rounded-3xl bg-paper p-6 md:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="new-gallery-title" className="text-2xl tracking-tight">
            Nouvelle galerie
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            className="grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="g-title" className="text-sm font-medium">
              Nom de la galerie
            </label>
            <input
              id="g-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mariage de Camille et Nathan"
              className={field}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="g-client" className="text-sm font-medium">
              Client
            </label>
            <input
              id="g-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Camille & Nathan"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="g-code" className="text-sm font-medium">
              Code d'accès
            </label>
            <div className="flex gap-2">
              <input
                id="g-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setCodeTaken(false)
                }}
                aria-invalid={codeTaken}
                aria-describedby="g-code-help"
                className={`${field} flex-1 font-mono tracking-widest`}
              />
              <button
                type="button"
                onClick={() => setCode(generateCode())}
                aria-label="Générer un nouveau code"
                className="grid size-[50px] shrink-0 place-items-center rounded-xl border border-ink/20
                           text-ink-soft transition-colors hover:border-ink/35 hover:text-ink"
              >
                <RefreshCw aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <p
              id="g-code-help"
              className={`text-xs ${codeTaken ? 'text-rose-700' : 'text-ink-soft'}`}
            >
              {codeTaken
                ? 'Ce code est déjà utilisé par une autre galerie.'
                : 'Sans caractères ambigus. Le client le saisit sur la page d’accueil.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="g-shot" className="text-sm font-medium">
                Date de la séance
              </label>
              <input
                id="g-shot"
                type="date"
                value={shotAt}
                onChange={(e) => setShotAt(e.target.value)}
                className={field}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="g-expires" className="text-sm font-medium">
                Expiration
              </label>
              <input
                id="g-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-paper-soft p-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={downloadEnabled}
                onChange={(e) => setDownloadEnabled(e.target.checked)}
                className="size-4 accent-[#1c1a17]"
              />
              Autoriser le téléchargement
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="size-4 accent-[#1c1a17]"
              />
              Publier tout de suite
              <span className="text-ink-soft">
                (sinon le code reste inactif)
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={limitedSelection}
                onChange={(e) => setLimitedSelection(e.target.checked)}
                aria-expanded={limitedSelection}
                className="size-4 accent-[#1c1a17]"
              />
              Galerie limitée
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={imageConsentRequested}
                onChange={(e) => setImageConsentRequested(e.target.checked)}
                className="size-4 accent-[#1c1a17]"
              />
              Demander l'autorisation de diffusion
            </label>

            {limitedSelection && (
              <div className="ml-7 flex flex-col gap-2 border-l border-ink/15 pl-4">
                <div className="flex items-center gap-3">
                  <label htmlFor="g-limit" className="text-sm">
                    Nombre de photos comprises
                  </label>
                  <input
                    id="g-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={selectionLimit}
                    onChange={(e) =>
                      setSelectionLimit(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-20 rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm
                               text-ink transition-colors hover:border-ink/35 focus:border-ink/60"
                  />
                </div>
                <p className="text-xs leading-relaxed text-ink-soft">
                  Le client choisit exactement ce nombre, valide, puis
                  télécharge. Les photos consultées portent votre filigrane.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-5 py-3 text-sm text-ink-soft transition-colors hover:text-ink"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm text-paper
                         transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
            >
              {saving && (
                <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
              )}
              {saving ? 'Création' : 'Créer la galerie'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
