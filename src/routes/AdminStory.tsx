import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Check,
  ChevronDown,
  Download,
  Images,
  LoaderCircle,
  RotateCcw,
  ZoomIn,
} from 'lucide-react'
import AdminShell from '../components/AdminShell'
import { listGalleries, type GalleryWithStatus, type Photo } from '../lib/galleries'
import {
  cells,
  clampTransform,
  exportBlob,
  IDENTITY,
  LAYOUTS,
  loadOverlay,
  loadPhoto,
  panRange,
  photoCount,
  render,
  STORY_HEIGHT,
  STORY_WIDTH,
  TEXTS,
  weightsOf,
  ZOOM_MAX,
  ZOOM_MIN,
  type Layout,
  type StoryText,
  type Transform,
} from '../lib/story'

/* ==================================================================
   ATELIER DE STORIES
   ------------------------------------------------------------------
   L'apercu occupe la gauche, aussi grand que l'ecran le permet : c'est
   l'objet du travail. Les reglages tiennent a droite, en trois menus
   qu'on ouvre l'un apres l'autre — ouvrir le suivant referme le
   precedent, pour que la colonne ne devienne jamais un mur.
   ================================================================== */

type SectionId = 'disposition' | 'texte' | 'photos'

function Section({
  id,
  titre,
  resume,
  ouvert,
  onToggle,
  children,
}: {
  id: SectionId
  titre: string
  resume: string
  ouvert: boolean
  onToggle: (id: SectionId) => void
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink/12 bg-white">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left
                   transition-colors hover:bg-paper-soft"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{titre}</span>
          <span className="mt-0.5 block truncate text-sm text-ink-soft">{resume}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-5 shrink-0 text-ink-soft transition-transform duration-200 ${
            ouvert ? 'rotate-180' : ''
          }`}
          strokeWidth={1.75}
        />
      </button>
      {ouvert && <div className="border-t border-ink/10 px-5 py-5">{children}</div>}
    </section>
  )
}

export default function AdminStory() {
  const [galleries, setGalleries] = useState<GalleryWithStatus[] | null>(null)
  const [galleryId, setGalleryId] = useState('')
  const [layout, setLayout] = useState<Layout>(LAYOUTS[0]!)
  const [text, setText] = useState<StoryText | null>(null)
  const [overlay, setOverlay] = useState<HTMLImageElement | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [ouvert, setOuvert] = useState<SectionId | null>('disposition')
  const [galeriesOuvertes, setGaleriesOuvertes] = useState(false)

  const [images, setImages] = useState<(HTMLImageElement | null)[]>([])
  const [transforms, setTransforms] = useState<(Transform | undefined)[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const commandesRef = useRef<HTMLDivElement>(null)
  const attendus = photoCount(layout)

  useEffect(() => {
    listGalleries()
      .then((list) => {
        const remplies = list.filter((g) => g.photos.length > 0)
        setGalleries(remplies)
        if (remplies[0]) setGalleryId(remplies[0].id)
      })
      .catch(() => setError('Impossible de charger vos galeries.'))
  }, [])

  const gallery = useMemo(
    () => galleries?.find((g) => g.id === galleryId) ?? null,
    [galleries, galleryId],
  )

  // Changer de galerie repart d'une selection vide ; changer de disposition
  // conserve ce qui rentre encore.
  useEffect(() => setSelected([]), [galleryId])
  // Un changement de photos ou de disposition rend les recadrages caducs.
  useEffect(() => {
    setTransforms([])
    setActive(null)
  }, [selected, layout])
  useEffect(() => {
    setSelected((current) => current.slice(0, attendus))
  }, [attendus])

  /* ------------------------ Chargement du calque ---------------------- */
  useEffect(() => {
    let cancelled = false
    if (!text) {
      setOverlay(null)
      return
    }
    loadOverlay(text.src)
      .then((image) => {
        if (!cancelled) setOverlay(image)
      })
      .catch(() => {
        if (!cancelled) setError("Le texte n'a pas pu être chargé.")
      })
    return () => {
      cancelled = true
    }
  }, [text])

  /* ----------------------- Chargement des photos ---------------------- */
  useEffect(() => {
    let cancelled = false
    if (selected.length === 0) {
      setImages([])
      return
    }

    setLoading(true)
    setError(null)
    Promise.all(selected.map(loadPhoto))
      .then((chargees) => {
        if (!cancelled) setImages(chargees)
      })
      .catch(() => {
        if (!cancelled) setError("Une photo n'a pas pu être chargée.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selected])

  /* --------------------------- Rendu du canvas ------------------------ */
  const dessiner = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    render(canvas, { layout, photos: images, overlay, transforms, active })
  }, [layout, images, overlay, transforms, active])

  useEffect(dessiner, [dessiner])

  /* ------------------------ Recadrage a la souris --------------------- */

  /** Coordonnees du pointeur, ramenees aux 1080 x 1920 du canvas. */
  function toCanvas(event: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * STORY_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * STORY_HEIGHT,
    }
  }

  function cellAt(event: { clientX: number; clientY: number }): number | null {
    const point = toCanvas(event)
    if (!point) return null
    const index = cells(layout).findIndex(
      (c) =>
        point.x >= c.x && point.x < c.x + c.w && point.y >= c.y && point.y < c.y + c.h,
    )
    return index >= 0 && images[index] ? index : null
  }

  function majTransform(index: number, change: (t: Transform) => Transform) {
    setTransforms((current) => {
      const suivant = [...current]
      suivant[index] = clampTransform(change(current[index] ?? IDENTITY))
      return suivant
    })
  }

  /** Glisser-deposer : on suit le pointeur jusqu'au relachement. */
  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const index = cellAt(event)
    setActive(index)
    if (index === null) return

    const image = images[index]
    const cell = cells(layout)[index]
    if (!image || !cell) return

    const depart = toCanvas(event)
    if (!depart) return
    const debut = transforms[index] ?? IDENTITY
    const { maxX, maxY } = panRange(image, cell, debut.zoom)

    event.currentTarget.setPointerCapture(event.pointerId)

    const bouger = (e: PointerEvent) => {
      const point = toCanvas(e)
      if (!point) return
      // Deplacement converti en fraction de la marge disponible : sans marge
      // dans un axe (la photo remplit pile), rien ne bouge dans cet axe.
      majTransform(index, () => ({
        zoom: debut.zoom,
        nx: maxX > 0 ? debut.nx + (point.x - depart.x) / maxX : 0,
        ny: maxY > 0 ? debut.ny + (point.y - depart.y) / maxY : 0,
      }))
    }
    const finir = () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', finir)
    }
    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', finir)
  }

  /**
   * Un clic ailleurs deselectionne.
   *
   * Deux exceptions, sans quoi l'outil serait inutilisable : le canvas, qui
   * gere lui-meme sa selection, et la barre de recadrage — attraper le
   * curseur de zoom ne doit pas faire disparaitre ce curseur.
   */
  useEffect(() => {
    if (active === null) return

    const dehors = (event: PointerEvent) => {
      const cible = event.target as Node | null
      if (!cible) return
      if (canvasRef.current?.contains(cible)) return
      if (commandesRef.current?.contains(cible)) return
      setActive(null)
    }
    const echap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null)
    }

    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => {
      document.removeEventListener('pointerdown', dehors)
      document.removeEventListener('keydown', echap)
    }
  }, [active])

  /**
   * Molette : zoome l'emplacement survole.
   * L'ecouteur est pose a la main pour pouvoir bloquer le defilement de la
   * page — React attache `onWheel` en mode passif, ou `preventDefault` est
   * sans effet.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => {
      const index = cellAt(event)
      if (index === null) return
      event.preventDefault()
      setActive(index)
      majTransform(index, (t) => ({
        ...t,
        zoom: t.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
      }))
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  })

  function togglePhoto(photo: Photo) {
    setSelected((current) => {
      if (current.includes(photo.id)) return current.filter((id) => id !== photo.id)
      // Au-dela du compte attendu, la plus ancienne cede sa place.
      return [...current, photo.id].slice(-attendus)
    })
  }

  async function telecharger() {
    const canvas = canvasRef.current
    if (!canvas) return

    const blob = await exportBlob(canvas, {
      layout,
      photos: images,
      overlay,
      transforms,
      active,
    })
    if (!blob) {
      setError("L'image n'a pas pu être produite.")
      return
    }

    const url = URL.createObjectURL(blob)
    const lien = document.createElement('a')
    lien.href = url
    lien.download = `story-${layout.id}-${Date.now()}.jpg`
    document.body.appendChild(lien)
    lien.click()
    lien.remove()
    // Liberer l'URL tout de suite peut couper un telechargement qui n'a pas
    // encore demarre. On laisse au navigateur le temps de s'en saisir.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const basculer = (id: SectionId) => setOuvert((actuel) => (actuel === id ? null : id))
  const complete = selected.length === attendus

  return (
    <AdminShell>
      {/* En-tete volontairement compact : chaque pixel pris ici est un pixel
          de moins pour l'apercu, qui est deja bride par la hauteur d'ecran. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl tracking-tight">Story</h1>
        <p className="text-sm text-ink-soft">
          Une image au format Instagram, à partir de vos galeries.
        </p>
      </div>

      <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
        {/* ------------------------- Aperçu -------------------------- */}
        <div className="lg:sticky lg:top-20">
          <div className="flex justify-center">
            {/* Le canvas fait toujours 1080 × 1920 ; seul l'affichage est
                réduit, l'export garde la pleine définition. */}
            <canvas
              ref={canvasRef}
              width={STORY_WIDTH}
              height={STORY_HEIGHT}
              aria-label="Aperçu de la story"
              onPointerDown={onPointerDown}
              className="h-auto max-h-[calc(100dvh-10rem)] w-auto max-w-full touch-none
                         rounded-2xl border border-ink/10 shadow-sm
                         [cursor:grab] active:[cursor:grabbing]"
            />
          </div>

          {/* Recadrage de l'emplacement selectionne. Sous l'aperçu plutôt
              que dans la colonne : ça concerne ce qu'on est en train de
              regarder, pas un réglage général. */}
          <div ref={commandesRef} className="mt-3 flex min-h-[3rem] items-center justify-center">
            {active !== null && images[active] ? (
              <div className="flex w-full max-w-md items-center gap-3 rounded-xl
                              border border-ink/12 bg-white px-4 py-2.5">
                <span className="shrink-0 text-sm text-ink">Photo {active + 1}</span>
                <ZoomIn aria-hidden className="size-4 shrink-0 text-ink-soft" strokeWidth={1.75} />
                <input
                  type="range"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={0.02}
                  value={(transforms[active] ?? IDENTITY).zoom}
                  onChange={(e) =>
                    majTransform(active, (t) => ({ ...t, zoom: Number(e.target.value) }))
                  }
                  aria-label={`Zoom de la photo ${active + 1}`}
                  className="min-w-0 flex-1 accent-[#1c1a17]"
                />
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                  {Math.round((transforms[active] ?? IDENTITY).zoom * 100)} %
                </span>
                <button
                  type="button"
                  onClick={() => majTransform(active, () => IDENTITY)}
                  aria-label="Recentrer la photo"
                  className="grid size-8 shrink-0 place-items-center rounded-full
                             text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
                >
                  <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            ) : (
              complete && (
                <p className="text-center text-xs text-ink-soft">
                  Cliquez une photo pour l'ajuster : glissez pour la déplacer,
                  molette pour zoomer.
                </p>
              )
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={telecharger}
              disabled={!complete}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm text-paper
                         transition-transform duration-150 hover:bg-ink/90 active:scale-[0.98]
                         disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download aria-hidden className="size-4" strokeWidth={1.75} />
              Télécharger
            </button>

            {loading && (
              <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
                Chargement
              </span>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                <Check aria-hidden className="size-4" strokeWidth={2} />
                Enregistré
              </span>
            )}
            {!complete && !loading && (
              <span className="text-sm text-ink-soft">
                {selected.length} sur {attendus} photo{attendus > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-center text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        {/* ------------------------ Réglages ------------------------- */}
        <div className="flex flex-col gap-3">
          <Section
            id="disposition"
            titre="Disposition"
            resume={`${layout.label} · ${attendus} photos`}
            ouvert={ouvert === 'disposition'}
            onToggle={basculer}
          >
            <div className="flex flex-col gap-2">
              {LAYOUTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLayout(item)}
                  aria-pressed={item.id === layout.id}
                  className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3
                              text-left text-sm transition-colors ${
                                item.id === layout.id
                                  ? 'border-ink bg-paper-soft text-ink'
                                  : 'border-ink/15 text-ink-soft hover:border-ink/35 hover:text-ink'
                              }`}
                >
                  <span className="flex items-center gap-3">
                    <Apercu layout={item} actif={item.id === layout.id} />
                    {item.label}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {photoCount(item)} photos
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section
            id="texte"
            titre="Texte"
            resume={text ? text.label : 'Sans texte'}
            ouvert={ouvert === 'texte'}
            onToggle={basculer}
          >
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setText(null)}
                aria-pressed={text === null}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  text === null
                    ? 'border-ink bg-paper-soft text-ink'
                    : 'border-ink/15 text-ink-soft hover:border-ink/35 hover:text-ink'
                }`}
              >
                Sans texte
                <span className="mt-0.5 block text-xs text-ink-faint">
                  La grille occupe toute la hauteur
                </span>
              </button>

              {TEXTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setText(item)}
                  aria-pressed={text?.id === item.id}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    text?.id === item.id
                      ? 'border-ink bg-paper-soft text-ink'
                      : 'border-ink/15 text-ink-soft hover:border-ink/35 hover:text-ink'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {/* Les quatre variantes disent les mêmes mots : seule la
                        mise en page les distingue, donc on la montre. */}
                    <span className="grid h-12 w-[27px] shrink-0 place-items-center
                                     overflow-hidden rounded bg-neutral-900">
                      <img src={item.src} alt="" className="h-full w-full object-contain" />
                    </span>
                    {item.label}
                  </span>
                </button>
              ))}

              {TEXTS.length === 0 && (
                <p className="rounded-xl bg-paper-soft px-4 py-3 text-xs leading-relaxed text-ink-soft">
                  Aucun texte enregistré pour l'instant. Envoyez-moi vos
                  formulations et elles apparaîtront ici.
                </p>
              )}
            </div>
          </Section>

          <Section
            id="photos"
            titre="Photos"
            resume={
              gallery
                ? `${gallery.title} · ${selected.length} sur ${attendus}`
                : 'Aucune galerie'
            }
            ouvert={ouvert === 'photos'}
            onToggle={basculer}
          >
            {galleries === null ? (
              <div className="h-12 animate-pulse rounded-xl bg-paper-soft" />
            ) : galleries.length === 0 ? (
              <div className="py-8 text-center">
                <Images aria-hidden className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} />
                <p className="mt-3 text-sm text-ink-soft">
                  Aucune galerie ne contient encore de photos.
                </p>
              </div>
            ) : (
              <>
                {/* Même dépliant que les trois menus principaux : en-tête
                    avec résumé et chevron, options en dessous. Un <select>
                    natif aurait ouvert le menu du système d'exploitation, qui
                    ne ressemble à rien du reste. */}
                <div className="overflow-hidden rounded-xl border border-ink/15">
                  <button
                    type="button"
                    onClick={() => setGaleriesOuvertes((v) => !v)}
                    aria-expanded={galeriesOuvertes}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3
                               text-left transition-colors hover:bg-paper-soft"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">Galerie</span>
                      <span className="mt-0.5 block truncate text-sm text-ink-soft">
                        {gallery
                          ? `${gallery.title} · ${gallery.photos.length} photos`
                          : 'Choisir'}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`size-5 shrink-0 text-ink-soft transition-transform duration-200 ${
                        galeriesOuvertes ? 'rotate-180' : ''
                      }`}
                      strokeWidth={1.75}
                    />
                  </button>

                  {galeriesOuvertes && (
                    <div className="flex max-h-64 flex-col gap-2 overflow-y-auto border-t border-ink/10 p-3">
                      {galleries.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setGalleryId(g.id)
                            setGaleriesOuvertes(false)
                          }}
                          aria-pressed={g.id === galleryId}
                          className={`flex items-baseline justify-between gap-3 rounded-xl border
                                      px-4 py-3 text-left text-sm transition-colors ${
                                        g.id === galleryId
                                          ? 'border-ink bg-paper-soft text-ink'
                                          : 'border-ink/15 text-ink-soft hover:border-ink/35 hover:text-ink'
                                      }`}
                        >
                          <span className="min-w-0 truncate">{g.title}</span>
                          <span className="shrink-0 text-xs text-ink-faint">
                            {g.photos.length} photos
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-4 text-sm text-ink-soft">
                  Cliquez dans l'ordre où vous voulez les voir apparaître.
                </p>

                <ul className="mt-3 grid max-h-[22rem] grid-cols-4 gap-2 overflow-y-auto pr-1">
                  {gallery?.photos.map((photo) => {
                    const rang = selected.indexOf(photo.id)
                    return (
                      <li key={photo.id}>
                        <button
                          type="button"
                          onClick={() => togglePhoto(photo)}
                          aria-pressed={rang >= 0}
                          className={`relative block aspect-square w-full overflow-hidden rounded-lg
                                      border-2 transition ${
                                        rang >= 0
                                          ? 'border-ink'
                                          : 'border-transparent opacity-80 hover:opacity-100'
                                      }`}
                        >
                          <img
                            // Sans `original=1`, les vignettes d'une galerie
                            // limitee arrivent filigranees : inutilisable pour
                            // choisir ce qu'on va mettre dans une story.
                            src={`${photo.thumb}&original=1`}
                            alt={photo.alt}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          {rang >= 0 && (
                            <span
                              className="absolute right-1 top-1 grid size-5 place-items-center
                                         rounded-full bg-ink text-[11px] text-paper"
                            >
                              {rang + 1}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </Section>
        </div>
      </div>
    </AdminShell>
  )
}

/**
 * Miniature de la disposition : plus lisible qu'un intitulé « 2 / 1 / 1 / 2 ».
 * Elle respecte les hauteurs de rangée, sans quoi elle mentirait sur le
 * résultat pour les dispositions à bande étroite.
 */
function Apercu({ layout, actif }: { layout: Layout; actif: boolean }) {
  const poids = weightsOf(layout)
  return (
    <span aria-hidden className="flex h-8 w-[22px] flex-col" style={{ gap: 2 }}>
      {layout.rows.map((colonnes, r) => (
        <span
          key={r}
          className="flex"
          style={{ gap: 2, flexGrow: poids[r] ?? 1, flexBasis: 0 }}
        >
          {Array.from({ length: colonnes }).map((_, c) => (
            <span
              key={c}
              className={`flex-1 rounded-[1px] ${actif ? 'bg-ink' : 'bg-ink/30'}`}
            />
          ))}
        </span>
      ))}
    </span>
  )
}
