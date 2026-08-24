import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Check, Download, Eye, Heart, ImageOff, Lock } from 'lucide-react'
import PhotoGrid from '../components/PhotoGrid'
import Lightbox from '../components/Lightbox'
import ReviewPrompt from '../components/ReviewPrompt'
import ConsentRequest from '../components/ConsentRequest'
import {
  accessErrorMessage,
  archiveUrl,
  getConsent,
  listFavorites,
  type ConsentState,
  openGallery,
  photoDownloadUrl,
  previewGallery,
  reopenGallery,
  setFavorite,
  validateSelection,
  type Gallery as GalleryType,
  type Photo,
} from '../lib/galleries'
import { currentUser } from '../lib/auth'
import { hasReviewed, markReviewed } from '../lib/review'
import { ApiError } from '../lib/api'
import logo from '../assets/logo-manartt-white.png'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; gallery: GalleryType }

/**
 * Declenche un telechargement sans quitter la page.
 * Le serveur repond avec un en-tete `Content-Disposition: attachment` et le
 * navigateur envoie les cookies tout seul : inutile de passer par un blob.
 */
function triggerDownload(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export default function Gallery() {
  const { code = '' } = useParams()
  const reduce = useReducedMotion()

  const [state, setState] = useState<State>({ status: 'loading' })
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [validated, setValidated] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  const [consent, setConsent] = useState<ConsentState | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)

  /** La photographe regarde sa propre galerie : lecture seule. */
  const [preview, setPreview] = useState(false)
  const [askReview, setAskReview] = useState(false)
  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (reviewTimer.current) clearTimeout(reviewTimer.current)
    },
    [],
  )

  // Surface claire pour la galerie, y compris sur l'overscroll iOS.
  useEffect(() => {
    document.documentElement.setAttribute('data-surface', 'light')
    return () => document.documentElement.removeAttribute('data-surface')
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    async function load() {
      // Photographe connectee : elle previsualise, elle ne visite pas. Passer
      // par le parcours client lui poserait un cookie de visiteuse et melangerait
      // ses coups de coeur a ceux de sa cliente.
      const me = await currentUser()
      if (cancelled) return

      if (me) {
        try {
          const gallery = await previewGallery(code)
          if (cancelled) return
          setPreview(true)
          setState({ status: 'ready', gallery })
          // En apercu, la demande est montree telle qu'elle apparait au client,
          // sans reponse possible.
          setConsent({
            requested: gallery.imageConsentRequested,
            terms: { version: '', text: '' },
            answer: null,
          })
          return
        } catch {
          // Galerie qui n'est pas la sienne : elle repasse par la porte client.
        }
      }

      // On tente d'abord la relecture, qui s'appuie sur le cookie deja obtenu :
      // c'est une simple lecture, non soumise au frein anti-force brute.
      // Sans cookie (lien ouvert directement), on repasse par la saisie du code.
      let gallery: GalleryType
      try {
        gallery = await reopenGallery(code)
      } catch {
        gallery = await openGallery(code)
      }

      if (cancelled) return
      setPreview(false)
      setState({ status: 'ready', gallery })

      const selection = await listFavorites(code)
      if (cancelled) return
      setFavorites(selection.favorites)
      setValidated(selection.validated)

      // La demande d'autorisation ne doit pas retarder l'affichage des photos.
      getConsent(code)
        .then((value) => {
          if (!cancelled) setConsent(value)
        })
        .catch(() => undefined)
    }

    load().catch((err) => {
      if (!cancelled) setState({ status: 'error', message: accessErrorMessage(err) })
    })

    return () => {
      cancelled = true
    }
  }, [code])

  const gallery = state.status === 'ready' ? state.gallery : null

  const limit = gallery?.limitedSelection ? gallery.selectionLimit : null

  /**
   * Le verrou n'existe que sur une galerie limitee.
   * Sans cette condition, une galerie repassee en complete resterait figee sur
   * la selection validee du temps ou elle etait limitee.
   */
  const locked = limit !== null && validated

  /**
   * Droit a l'image : tant que le client n'a pas repondu, le telechargement
   * attend. Repondre, pas accepter — un refus ouvre tout autant.
   */
  const consentPending = Boolean(
    consent && consent.requested && !consent.answer && !preview,
  )

  /** Relit la selection commune depuis le serveur. */
  const refreshSelection = useCallback(async () => {
    if (preview) return
    const selection = await listFavorites(code)
    setFavorites(selection.favorites)
    setValidated(selection.validated)
  }, [code, preview])

  /**
   * La selection est partagee : elle a pu changer pendant qu'on regardait
   * ailleurs. On la relit au retour sur l'onglet, plutot que d'interroger le
   * serveur en boucle pour rien.
   */
  useEffect(() => {
    if (preview || state.status !== 'ready') return

    const refresh = () => void refreshSelection()
    // Reprise de l'onglet, et retour sur la fenetre : le second couvre le cas
    // ou l'onglet n'a jamais ete masque, seulement mis derriere une autre app.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [preview, state.status, refreshSelection])

  const toggleFavorite = useCallback(
    (photoId: string) => {
      if (preview) return
      if (locked) {
        setNotice('La sélection a été validée, elle ne peut plus être modifiée.')
        return
      }

      const willBeFavorite = !favorites.has(photoId)

      // Plafond verifie ici pour une reponse immediate, et re-verifie par le
      // serveur qui reste seul juge.
      if (willBeFavorite && limit !== null && favorites.size >= limit) {
        setNotice(
          `La sélection est complète (${limit} photo${limit > 1 ? 's' : ''}). Retirez-en une pour en choisir une autre.`,
        )
        return
      }

      setNotice(null)

      // Bascule immediate : l'aller-retour reseau ne doit pas se voir.
      setFavorites((previous) => {
        const next = new Set(previous)
        if (willBeFavorite) next.add(photoId)
        else next.delete(photoId)
        return next
      })

      setFavorite(photoId, willBeFavorite)
        .then((selection) => {
          // La selection est commune : l'autre ecran a pu la faire bouger
          // pendant qu'on regardait. Le serveur a le dernier mot.
          setFavorites(selection.favorites)
          setValidated(selection.validated)
        })
        .catch((err) => {
          // Refus du serveur : on remet l'affichage en accord avec la realite.
          setFavorites((previous) => {
            const next = new Set(previous)
            if (willBeFavorite) next.delete(photoId)
            else next.add(photoId)
            return next
          })
          if (err instanceof ApiError && err.message) setNotice(err.message)
          void refreshSelection()
        })
    },
    [favorites, locked, limit, preview, refreshSelection],
  )

  /**
   * Telechargement de l'archive, puis invitation a laisser un avis.
   * Le delai laisse la barre de telechargement du navigateur apparaitre : la
   * fenetre ne doit pas venir couvrir ce que le client attendait.
   */
  function downloadArchive(onlyFavorites: boolean) {
    // Le serveur refuserait de toute facon : mieux vaut ouvrir la question que
    // laisser le telechargement echouer sans explication.
    if (consentPending) {
      setConsentOpen(true)
      return
    }

    triggerDownload(archiveUrl(gallery!.code, onlyFavorites))

    if (hasReviewed(code)) return
    if (reviewTimer.current) clearTimeout(reviewTimer.current)
    reviewTimer.current = setTimeout(() => setAskReview(true), 1500)
  }

  async function confirmSelection() {
    if (!gallery || limit === null) return

    const sure = window.confirm(
      `Valider définitivement ces ${limit} photo${limit > 1 ? 's' : ''} ?\n\n` +
        'Personne ne pourra plus changer ce choix ensuite, sur aucun appareil.',
    )
    if (!sure) return

    setValidating(true)
    setNotice(null)
    try {
      await validateSelection(gallery.code)
      setValidated(true)
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.message
          ? err.message
          : 'La validation a échoué. Réessayez.',
      )
    } finally {
      setValidating(false)
    }
  }

  /* ---------------------------- Chargement ---------------------------- */
  if (state.status === 'loading') {
    return (
      <main className="min-h-dvh bg-paper px-6 py-10 font-sans md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="h-5 w-40 animate-pulse rounded bg-paper-soft" />
          <div className="mt-10 h-10 w-80 max-w-full animate-pulse rounded bg-paper-soft" />
          {/* Squelettes a la forme exacte de la grille */}
          <div className="mt-12 flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex gap-2">
                {[3, 2, 4].map((grow, i) => (
                  <div
                    key={i}
                    style={{ flexGrow: grow, flexBasis: 0, height: 320 }}
                    className="animate-pulse rounded-sm bg-paper-soft"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  /* ------------------------------ Erreur ------------------------------ */
  if (state.status === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 font-sans">
        <div className="w-full max-w-md text-center">
          <ImageOff aria-hidden className="mx-auto size-10 text-ink-faint" strokeWidth={1.5} />
          <h1 className="mt-6 text-2xl text-ink">Galerie indisponible</h1>
          <p className="mt-3 text-ink-soft">{state.message}</p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-ink px-6 py-3.5
                       text-paper transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98]"
          >
            <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
            Saisir un autre code
          </Link>
        </div>
      </main>
    )
  }

  /* ------------------------------- Prete ------------------------------ */
  const selectedCount = favorites.size
  const shotDate = new Date(gallery!.shotAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="min-h-dvh bg-paper font-sans text-ink">
      {/* Apercu : la photographe doit savoir ou elle est, et pouvoir revenir. */}
      {preview && (
        <div className="border-b border-accent/40 bg-accent-wash">
          <div
            className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3
                       px-6 py-3 md:px-10"
          >
            <p className="flex items-center gap-2 text-sm text-ink">
              <Eye aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
              <span>
                Aperçu : voici ce que voit votre cliente. Les cœurs et la
                validation sont désactivés ici.
              </span>
            </p>
            <Link
              to={`/admin/g/${gallery!.id}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2
                         text-sm text-paper transition-transform duration-150
                         hover:bg-ink/90 active:scale-[0.98]"
            >
              <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
              Retour à la gestion
            </Link>
          </div>
        </div>
      )}

      {/* En-tete discret, colle en haut */}
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6 md:px-10">
          {/* En apercu, ce lien ramene a la gestion : c'est le seul repere qui
              reste visible une fois le bandeau defile. */}
          <Link
            to={preview ? `/admin/g/${gallery!.id}` : '/'}
            className="flex items-center gap-3 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
            <img
              src={logo}
              alt="man.artt"
              width={96}
              height={48}
              className="h-auto w-20 [filter:invert(1)]"
            />
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-soft sm:inline">
              {limit !== null
                ? `${selectedCount} sur ${limit} choisie${limit > 1 ? 's' : ''}`
                : selectedCount > 0
                  ? `${selectedCount} photo${selectedCount > 1 ? 's' : ''} sélectionnée${selectedCount > 1 ? 's' : ''}`
                  : `${gallery!.photos.length} photos`}
            </span>

            {/* Galerie limitee : tant que la selection n'est pas validee, on
                propose de valider, pas de telecharger. */}
            {limit !== null && !validated && !preview && gallery!.photos.length > 0 && (
              <button
                type="button"
                onClick={confirmSelection}
                disabled={selectedCount !== limit || validating}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm
                           text-paper transition-transform duration-150
                           hover:bg-ink/90 active:scale-[0.98]
                           disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Check aria-hidden className="size-4" strokeWidth={2} />
                {validating ? 'Validation' : 'Valider la sélection'}
              </button>
            )}

            {/* Galerie complete : le client emporte tout. Ses coups de coeur
                restent un raccourci, pas une restriction. */}
            {gallery!.downloadEnabled && gallery!.photos.length > 0 && limit === null && (
              <>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadArchive(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5
                               text-sm text-ink-soft transition-colors
                               hover:border-ink/40 hover:text-ink"
                  >
                    <Heart aria-hidden className="size-4" strokeWidth={1.75} />
                    La sélection ({selectedCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadArchive(false)}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm
                             text-paper transition-transform duration-150
                             hover:bg-ink/90 active:scale-[0.98]"
                >
                  <Download aria-hidden className="size-4" strokeWidth={1.75} />
                  Tout télécharger
                </button>
              </>
            )}

            {/* Galerie limitee : seulement une fois la selection figee. */}
            {gallery!.downloadEnabled &&
              gallery!.photos.length > 0 &&
              limit !== null &&
              validated && (
                <button
                  type="button"
                  onClick={() => downloadArchive(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm
                             text-paper transition-transform duration-150
                             hover:bg-ink/90 active:scale-[0.98]"
                >
                  <Download aria-hidden className="size-4" strokeWidth={1.75} />
                  Télécharger la sélection
                </button>
              )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-14 md:px-10 md:py-20">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <p className="text-sm text-ink-soft">{shotDate}</p>
          <h1 className="mt-2 text-3xl tracking-tight md:text-5xl">{gallery!.title}</h1>
          <p className="mt-4 max-w-lg leading-relaxed text-ink-soft">
            {limit === null
              ? "Parcourez vos photos, gardez vos préférées d'un clic sur le cœur, puis téléchargez-les."
              : validated
                ? 'Votre sélection est validée. Vous pouvez la télécharger autant de fois que vous le souhaitez.'
                : `Votre forfait comprend ${limit} photo${limit > 1 ? 's' : ''}. Choisissez-les d'un clic sur le cœur, puis validez pour les télécharger. Vous pouvez choisir à plusieurs : la sélection est commune à tous ceux qui ont le code.`}
          </p>
        </motion.div>

        {/* Droit a l'image : la demande vient avant les photos, pas apres. */}
        {consent && gallery!.photos.length > 0 && (
          <div className="mt-8">
            <ConsentRequest
              code={gallery!.code}
              consent={consent}
              onAnswered={setConsent}
              open={consentOpen}
              onOpenChange={setConsentOpen}
              required={consentPending && gallery!.downloadEnabled}
              readOnly={preview}
            />
          </div>
        )}

        {/* Etat de la selection, sur galerie limitee */}
        {limit !== null && gallery!.photos.length > 0 && (
          <div
            className={`mt-8 flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 ${
              validated
                ? 'border-accent/45 bg-accent-wash'
                : 'border-ink/10 bg-paper-soft'
            }`}
          >
            {validated ? (
              <>
                <Lock aria-hidden className="size-5 text-accent-deep" strokeWidth={1.75} />
                <p className="text-sm text-ink">
                  Sélection validée : {limit} photo{limit > 1 ? 's' : ''} vous
                  attendent en téléchargement.
                </p>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <p className="text-sm text-ink">
                    {selectedCount} photo{selectedCount > 1 ? 's' : ''} choisie
                    {selectedCount > 1 ? 's' : ''} sur {limit}
                  </p>
                  {/* Barre de progression du forfait */}
                  <div
                    className="mt-2 h-1 w-56 max-w-full overflow-hidden rounded-full bg-ink/10"
                    role="progressbar"
                    aria-valuenow={selectedCount}
                    aria-valuemin={0}
                    aria-valuemax={limit}
                  >
                    <div
                      className="h-full bg-accent-deep transition-[width] duration-300"
                      style={{ width: `${Math.min(100, (selectedCount / limit) * 100)}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-ink-soft">
                  {selectedCount === limit
                    ? 'La sélection est complète.'
                    : `Encore ${limit - selectedCount} à choisir.`}
                </p>
              </>
            )}
          </div>
        )}

        {notice && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {notice}
          </p>
        )}

        <div className="mt-12">
          {gallery!.photos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/15 py-20 text-center">
              <Heart aria-hidden className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} />
              <p className="mt-4 text-ink-soft">
                Cette galerie ne contient pas encore de photos.
              </p>
            </div>
          ) : (
            <PhotoGrid
              photos={gallery!.photos}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onOpen={setLightboxIndex}
              readOnly={preview}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            photos={gallery!.photos}
            index={lightboxIndex}
            favorites={favorites}
            // Sur galerie limitee, le serveur refuse tant que la selection
            // n'est pas validee : autant ne pas proposer un bouton qui echoue.
            downloadEnabled={
              gallery!.downloadEnabled && (limit === null || validated)
            }
            readOnly={preview}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
            onToggleFavorite={toggleFavorite}
            onDownload={(photo: Photo) => {
              // Meme regle qu'a la galerie : la question passe avant.
              if (consentPending) {
                setLightboxIndex(null)
                setConsentOpen(true)
                return
              }
              triggerDownload(photoDownloadUrl(photo.id))
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {askReview && (
          <ReviewPrompt
            clientName={gallery!.clientName}
            onClose={() => setAskReview(false)}
            onReviewed={() => {
              // En apercu, la photographe teste le message : ne pas lui faire
              // croire qu'elle a laisse un avis.
              if (!preview) markReviewed(code)
              setAskReview(false)
            }}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
