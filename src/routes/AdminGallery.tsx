import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Check,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import AdminShell from '../components/AdminShell'
import GalleryStatus from '../components/GalleryStatus'
import {
  addPhotos,
  deleteGallery,
  generateCode,
  getGallery,
  removePhoto,
  updateGallery,
  type GalleryWithStatus,
  type ImportProgress,
} from '../lib/galleries'
import { ApiError } from '../lib/api'

/**
 * Extensions RAW acceptees, pour le selecteur de fichiers.
 * Doit rester alignee avec `server/src/raw.ts`, qui fait foi.
 */
const RAW_EXTENSIONS =
  '.orf,.cr2,.cr3,.nef,.nrw,.arw,.srf,.sr2,.raf,.rw2,.pef,.dng'

const field =
  'rounded-xl border border-ink/20 bg-white px-4 py-3 text-ink placeholder:text-ink-faint ' +
  'transition-colors hover:border-ink/35 focus:border-ink/60'

export default function AdminGallery() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  const [gallery, setGallery] = useState<GalleryWithStatus | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Formulaire des reglages
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [code, setCode] = useState('')
  const [shotAt, setShotAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [downloadEnabled, setDownloadEnabled] = useState(true)
  const [published, setPublished] = useState(true)
  const [limitedSelection, setLimitedSelection] = useState(false)
  const [selectionLimit, setSelectionLimit] = useState(10)
  const [imageConsentRequested, setImageConsentRequested] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [failed, setFailed] = useState<string[]>([])

  useEffect(() => {
    getGallery(id)
      .then((g) => {
        setGallery(g)
        setTitle(g.title)
        setClientName(g.clientName)
        setCode(g.code)
        setShotAt(g.shotAt)
        setExpiresAt(g.expiresAt ?? '')
        setDownloadEnabled(g.downloadEnabled)
        setPublished(g.published)
        setLimitedSelection(g.limitedSelection)
        setSelectionLimit(g.selectionLimit)
        setImageConsentRequested(g.imageConsentRequested)
      })
      .catch(() => setNotFound(true))
  }, [id])

  // L'unicite du code est tranchee par le serveur, seul a voir toutes les
  // galeries et a l'abri d'une course entre deux enregistrements.
  const [codeTaken, setCodeTaken] = useState(false)

  async function handleSave(event: FormEvent) {
    event.preventDefault()

    setSaving(true)
    setCodeTaken(false)
    setError(null)
    try {
      const updated = await updateGallery(id, {
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
      setGallery(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'code_taken') {
        setCodeTaken(true)
        setError('Ce code est déjà utilisé par une autre galerie.')
      } else {
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : 'Enregistrement impossible.',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  async function importFiles(files: FileList | File[]) {
    const list = [...files]
    if (list.length === 0) return

    setFailed([])
    setProgress({ done: 0, total: list.length, current: '', failed: [] })
    const updated = await addPhotos(id, list, setProgress)
    setGallery(updated)
    setProgress((last) => {
      setFailed(last?.failed ?? [])
      return null
    })
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void importFiles(event.dataTransfer.files)
  }

  async function handleDelete() {
    const sure = window.confirm(
      `Supprimer définitivement « ${gallery?.title} » et ses ${gallery?.photos.length} photos ? Cette action est irréversible.`,
    )
    if (!sure) return
    await deleteGallery(id)
    navigate('/admin', { replace: true })
  }

  if (notFound) {
    return (
      <AdminShell back={{ to: '/admin', label: 'Retour aux galeries' }}>
        <h1 className="text-2xl">Galerie introuvable</h1>
      </AdminShell>
    )
  }

  if (!gallery) {
    return (
      <AdminShell back={{ to: '/admin', label: 'Retour aux galeries' }}>
        <div className="h-10 w-72 animate-pulse rounded bg-paper-soft" />
        <div className="mt-8 h-56 animate-pulse rounded-2xl bg-paper-soft" />
      </AdminShell>
    )
  }

  return (
    <AdminShell back={{ to: '/admin', label: 'Retour aux galeries' }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight">{gallery.title}</h1>
          <p className="mt-2 text-ink-soft">
            {gallery.photos.length} photo{gallery.photos.length > 1 ? 's' : ''}
          </p>
          <div className="mt-3">
            <GalleryStatus gallery={gallery} detailed />
          </div>
        </div>

        <Link
          to={`/g/${gallery.code}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-2.5
                     text-sm text-ink-soft transition-colors hover:border-ink/35 hover:text-ink"
        >
          <ExternalLink aria-hidden className="size-4" strokeWidth={1.75} />
          Voir comme le client
        </Link>
      </div>

      {/* --------------- Autorisation de diffusion ---------------- */}
      {gallery.imageConsentRequested && (
        <section className="mt-8">
          <div
            className={`rounded-2xl border px-5 py-4 ${
              gallery.imageConsent?.granted
                ? 'border-accent/45 bg-accent-wash'
                : 'border-ink/10 bg-paper-soft'
            }`}
          >
            <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
              <Share2 aria-hidden className="size-4 text-ink-soft" strokeWidth={1.75} />
              Droit à l'image
            </h2>

            {gallery.imageConsent === null ? (
              <p className="mt-2 text-sm text-ink-soft">
                Votre cliente n'a pas encore répondu à la demande.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink">
                  {gallery.imageConsent.granted ? (
                    <>
                      <span className="text-accent-deep">Diffusion autorisée</span> par{' '}
                      {gallery.imageConsent.signerName}, le{' '}
                      {new Date(gallery.imageConsent.decidedAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      .
                    </>
                  ) : (
                    <>
                      Diffusion refusée par {gallery.imageConsent.signerName}, le{' '}
                      {new Date(gallery.imageConsent.decidedAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      .
                    </>
                  )}
                </p>

                {/* Une réserve prime sur l'accord : elle doit sauter aux yeux. */}
                {gallery.imageConsent.notes && (
                  <p className="mt-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Réserve exprimée : « {gallery.imageConsent.notes} »
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* ------------------------- Import ------------------------- */}
      <section className="mt-10">
        <h2 className="text-lg tracking-tight">Photos</h2>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors
                      ${dragging ? 'border-ink/50 bg-paper-soft' : 'border-ink/15'}`}
        >
          {progress ? (
            <div>
              <LoaderCircle
                aria-hidden
                className="mx-auto size-7 animate-spin text-ink-soft"
                strokeWidth={1.5}
              />
              <p className="mt-4 text-sm text-ink-soft">
                Import {progress.done} sur {progress.total}
                {progress.current ? ` · ${progress.current}` : ''}
              </p>
              <div className="mx-auto mt-4 h-1 w-64 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full bg-ink transition-[width] duration-300"
                  style={{
                    width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <Upload aria-hidden className="mx-auto size-7 text-ink-soft" strokeWidth={1.5} />
              <p className="mt-4 text-ink-soft">
                Glissez vos photos ici, ou
              </p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="mt-3 rounded-full bg-ink px-5 py-2.5 text-sm text-paper
                           transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98]"
              >
                Choisir des fichiers
              </button>
              <input
                ref={fileInput}
                type="file"
                // Les RAW n'ont pas de type MIME enregistre : sans les
                // extensions, ils seraient invisibles dans le selecteur.
                accept={`image/*,${RAW_EXTENSIONS}`}
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void importFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-ink-soft">
                JPEG, PNG, WebP, TIFF, et les RAW d'appareil photo (.ORF, .CR2,
                .NEF, .ARW, .DNG...). Pour un RAW, vos clients voient l'aperçu
                que le boîtier a embarqué, et téléchargent le fichier d'origine.
              </p>
            </>
          )}
        </div>

        {failed.length > 0 && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {failed.length} fichier{failed.length > 1 ? 's' : ''} n'a pas pu être
            importé : {failed.join(', ')}. Vérifiez le format, puis réessayez.
          </p>
        )}

        {gallery.photos.length > 0 && (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {gallery.photos.map((photo) => (
              <li
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-xl bg-paper-soft"
              >
                <img
                  src={photo.thumb}
                  alt={photo.alt}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setGallery(await removePhoto(id, photo.id))
                  }}
                  aria-label={`Retirer ${photo.alt}`}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full
                             bg-ink/70 text-white opacity-0 backdrop-blur-sm transition
                             group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X aria-hidden className="size-4" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------ Reglages ------------------------ */}
      <section className="mt-14">
        <h2 className="text-lg tracking-tight">Réglages</h2>

        <form onSubmit={handleSave} className="mt-4 flex flex-col gap-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="e-title" className="text-sm font-medium">
                Nom de la galerie
              </label>
              <input
                id="e-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={field}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="e-client" className="text-sm font-medium">
                Client
              </label>
              <input
                id="e-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="e-code" className="text-sm font-medium">
              Code d'accès
            </label>
            <div className="flex max-w-sm gap-2">
              <input
                id="e-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setCodeTaken(false)
                }}
                aria-invalid={codeTaken}
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
            {codeTaken && (
              <p className="text-xs text-rose-700">
                Ce code est déjà utilisé par une autre galerie.
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="e-shot" className="text-sm font-medium">
                Date de la séance
              </label>
              <input
                id="e-shot"
                type="date"
                value={shotAt}
                onChange={(e) => setShotAt(e.target.value)}
                className={field}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="e-expires" className="text-sm font-medium">
                Expiration
              </label>
              <input
                id="e-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div className="flex max-w-md flex-col gap-3 rounded-xl bg-paper-soft p-4">
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
              Galerie publiée
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={limitedSelection}
                onChange={(e) => setLimitedSelection(e.target.checked)}
                aria-controls="limite-detail"
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

            {/* Le reglage n'apparait que si l'option est cochee : inutile de
                montrer un nombre de photos quand il ne sert a rien. */}
            {limitedSelection && (
              <div
                id="limite-detail"
                className="ml-7 flex flex-col gap-3 border-l border-ink/15 pl-4"
              >
                <div className="flex items-center gap-3">
                  <label htmlFor="e-limit" className="text-sm">
                    Nombre de photos comprises
                  </label>
                  <input
                    id="e-limit"
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
                  Le client choisit exactement {selectionLimit} photo
                  {selectionLimit > 1 ? 's' : ''}, valide son choix, puis les
                  télécharge. Tant qu'il n'a pas validé, rien n'est
                  téléchargeable, et les photos qu'il consulte portent votre
                  logo en filigrane.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm text-paper
                         transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
            >
              {saving && (
                <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
              )}
              Enregistrer
            </button>

            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                <Check aria-hidden className="size-4" strokeWidth={2} />
                Enregistré
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ----------------------- Suppression ---------------------- */}
      <section className="mt-14 border-t border-ink/10 pt-8">
        <button
          type="button"
          onClick={handleDelete}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-5 py-3
                     text-sm text-rose-700 transition-colors hover:bg-rose-50"
        >
          <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
          Supprimer cette galerie
        </button>
      </section>
    </AdminShell>
  )
}
