import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Crop,
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

/**
 * Ce que fait un glisser sur l'apercu. Les deux gestes se ressemblent trop
 * pour etre devines : c'est la photographe qui choisit, d'un bouton.
 */
type Mode = 'recadrer' | 'reorganiser'

/**
 * Une entree par case de la disposition, dans l'ordre des cases.
 * `null` = case vide. Retirer une photo laisse un trou plutot que de faire
 * remonter les suivantes : chaque photo garde la place qu'on lui a donnee.
 */
type Cases = (string | null)[]

/** Deplacement minimal, en pixels, avant qu'un appui devienne un glisser. */
const SEUIL_GLISSER = 5

function casesVides(n: number): Cases {
  return Array.from({ length: n }, () => null)
}

/**
 * Adapte les cases a une nouvelle disposition.
 * Chaque photo garde sa place si elle existe encore ; celles qui tombaient
 * au-dela viennent combler les trous, dans l'ordre. Le surplus est ecarte.
 */
function ajuster(cases: Cases, n: number): Cases {
  const suivantes = [...cases.slice(0, n), ...casesVides(Math.max(0, n - cases.length))]
  const debordantes = cases.slice(n).filter((id): id is string => id !== null)
  for (let i = 0; i < suivantes.length && debordantes.length > 0; i += 1) {
    if (suivantes[i] === null) suivantes[i] = debordantes.shift() ?? null
  }
  return suivantes
}

/** Copie d'un dictionnaire, sans une cle. */
function sans<T>(objet: Record<string, T>, cle: string): Record<string, T> {
  const copie = { ...objet }
  delete copie[cle]
  return copie
}

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
  const [cases, setCases] = useState<Cases>(() => casesVides(photoCount(LAYOUTS[0]!)))
  const [ouvert, setOuvert] = useState<SectionId | null>('disposition')
  const [galeriesOuvertes, setGaleriesOuvertes] = useState(false)
  const [mode, setMode] = useState<Mode>('recadrer')

  /** Photos deja decodees, par identifiant : un echange ne recharge rien. */
  const [chargees, setChargees] = useState<Record<string, HTMLImageElement>>({})
  const [echecs, setEchecs] = useState<Set<string>>(() => new Set())
  /**
   * Recadrage par photo, et non par case : quand une photo change de place,
   * son zoom et son cadrage la suivent.
   */
  const [transforms, setTransforms] = useState<Record<string, Transform>>({})
  const [active, setActive] = useState<number | null>(null)
  const [glisse, setGlisse] = useState<{ depuis: number; vers: number | null } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [avis, setAvis] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const commandesRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const galerieRef = useRef<HTMLUListElement>(null)
  const fantome = useRef<HTMLImageElement | null>(null)
  const pointeur = useRef({ x: 0, y: 0 })
  /** Vrai juste apres un glisser : le clic qui suit le relachement est ignore. */
  const vientDeGlisser = useRef(false)
  const enCours = useRef(new Set<string>())
  /** Change a chaque galerie : un chargement lance pour l'ancienne est ignore. */
  const generation = useRef(0)
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
  const photosParId = useMemo(
    () => new Map((gallery?.photos ?? []).map((p) => [p.id, p])),
    [gallery],
  )

  // Changer de galerie repart de cases vides.
  useEffect(() => {
    generation.current += 1
    enCours.current.clear()
    setCases((actuelles) => actuelles.map(() => null))
    setChargees({})
    setEchecs(new Set())
    setTransforms({})
    setActive(null)
  }, [galleryId])

  // Changer de disposition garde chaque photo a sa place tant qu'elle existe.
  useEffect(() => {
    setCases((actuelles) => ajuster(actuelles, attendus))
  }, [attendus])
  useEffect(() => setActive(null), [layout])

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

  // Seules les photos qu'on n'a pas encore sont demandees : echanger deux
  // cases, ou en vider une, ne declenche aucun telechargement.
  useEffect(() => {
    const manquantes = cases.filter(
      (id): id is string =>
        id !== null && !chargees[id] && !echecs.has(id) && !enCours.current.has(id),
    )
    if (manquantes.length === 0) return

    const gen = generation.current
    setError(null)
    for (const id of manquantes) {
      enCours.current.add(id)
      loadPhoto(id)
        .then((image) => {
          if (gen === generation.current) {
            setChargees((avant) => ({ ...avant, [id]: image }))
          }
        })
        .catch(() => {
          if (gen === generation.current) {
            setEchecs((avant) => new Set(avant).add(id))
            setError("Une photo n'a pas pu être chargée.")
          }
        })
        .finally(() => enCours.current.delete(id))
    }
  }, [cases, chargees, echecs])

  const photos = useMemo(
    () => cases.map((id) => (id ? chargees[id] ?? null : null)),
    [cases, chargees],
  )
  const transformsParCase = useMemo(
    () => cases.map((id) => (id ? transforms[id] : undefined)),
    [cases, transforms],
  )
  const remplies = cases.filter((id) => id !== null).length
  const loading = cases.some((id) => id !== null && !chargees[id] && !echecs.has(id))
  const complete = remplies === attendus

  /* --------------------------- Rendu du canvas ------------------------ */
  const dessiner = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    render(canvas, {
      layout,
      photos,
      overlay,
      transforms: transformsParCase,
      active,
      glisse,
    })
  }, [layout, photos, overlay, transformsParCase, active, glisse])

  useEffect(dessiner, [dessiner])

  /* ------------------------------ Reperage ---------------------------- */

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

  /** Case de l'apercu sous le pointeur, vide ou non. */
  function caseDuCanvas(event: { clientX: number; clientY: number }): number | null {
    const point = toCanvas(event)
    if (!point) return null
    const index = cells(layout).findIndex(
      (c) =>
        point.x >= c.x && point.x < c.x + c.w && point.y >= c.y && point.y < c.y + c.h,
    )
    return index >= 0 ? index : null
  }

  /**
   * Case visee pendant un glisser, sur l'apercu comme dans la bande : on
   * peut prendre une photo dans l'une et la lacher dans l'autre.
   */
  function caseSous(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)
    const vignette = element?.closest<HTMLElement>('[data-case]')
    if (vignette) return Number(vignette.dataset.case)
    if (element === canvasRef.current) return caseDuCanvas({ clientX: x, clientY: y })
    return null
  }

  function majTransform(index: number, change: (t: Transform) => Transform) {
    const id = cases[index]
    if (!id) return
    setTransforms((actuels) => ({
      ...actuels,
      [id]: clampTransform(change(actuels[id] ?? IDENTITY)),
    }))
  }

  /* ---------------------------- Echange ------------------------------- */

  /** Echange deux cases. Vers une case vide, c'est un simple deplacement. */
  function echanger(a: number, b: number) {
    if (a === b) return
    setCases((actuelles) => {
      const suivantes = [...actuelles]
      suivantes[a] = actuelles[b] ?? null
      suivantes[b] = actuelles[a] ?? null
      return suivantes
    })
    // La selection suit la photo qu'on vient de deplacer.
    setActive((actuelle) => (actuelle === a ? b : actuelle === b ? a : actuelle))
  }

  /** Colle la vignette flottante sous le pointeur, sans repasser par React. */
  function placerFantome() {
    const el = fantome.current
    if (!el) return
    const { x, y } = pointeur.current
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
  }

  /**
   * Debut d'un glisser, depuis l'apercu ou la bande.
   *
   * Rien ne se passe sous quelques pixels de deplacement : un simple clic
   * doit rester un clic. Au-dela, la photo se detache et suit le pointeur ;
   * la lacher sur une autre case echange les deux. Echap annule.
   */
  function commencerGlisse(depuis: number, event: React.PointerEvent) {
    if (event.button !== 0 || !cases[depuis]) return
    const depart = { x: event.clientX, y: event.clientY }
    pointeur.current = depart
    let lance = false

    const bouger = (e: PointerEvent) => {
      pointeur.current = { x: e.clientX, y: e.clientY }
      if (!lance) {
        if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) < SEUIL_GLISSER) return
        lance = true
        vientDeGlisser.current = true
      }
      placerFantome()
      const vers = caseSous(e.clientX, e.clientY)
      setGlisse((actuel) =>
        actuel && actuel.vers === vers ? actuel : { depuis, vers },
      )
    }
    const arreter = () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', lacher)
      window.removeEventListener('pointercancel', arreter)
      window.removeEventListener('keydown', echap)
      setGlisse(null)
      // Le navigateur emet un clic juste apres le relachement : on le laisse
      // passer avant de rearmer les clics de la bande.
      setTimeout(() => {
        vientDeGlisser.current = false
      }, 0)
    }
    const lacher = (e: PointerEvent) => {
      arreter()
      if (!lance) return
      const vers = caseSous(e.clientX, e.clientY)
      if (vers !== null) echanger(depuis, vers)
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') arreter()
    }

    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', lacher)
    window.addEventListener('pointercancel', arreter)
    window.addEventListener('keydown', echap)
  }

  /* ------------------------ Geste sur l'apercu ------------------------ */

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const index = caseDuCanvas(event)
    setActive(index)
    if (index === null) return

    if (mode === 'reorganiser') {
      commencerGlisse(index, event)
      return
    }

    // Recadrage : seulement s'il y a une photo a deplacer.
    const id = cases[index]
    const image = photos[index]
    const cell = cells(layout)[index]
    if (!id || !image || !cell) return

    const depart = toCanvas(event)
    if (!depart) return
    const debut = transforms[id] ?? IDENTITY
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
   * Quatre exceptions, sans quoi l'outil serait inutilisable : le canvas, qui
   * gere lui-meme sa selection ; les commandes sous l'apercu — attraper le
   * curseur de zoom ne doit pas le faire disparaitre ; le rail, dont la bande
   * sert justement a choisir une case ; et les photos de la galerie, puisqu'en
   * cliquer une sert a remplir la case choisie.
   */
  useEffect(() => {
    if (active === null) return

    const dehors = (event: PointerEvent) => {
      const cible = event.target as Node | null
      if (!cible) return
      if (canvasRef.current?.contains(cible)) return
      if (commandesRef.current?.contains(cible)) return
      if (railRef.current?.contains(cible)) return
      if (galerieRef.current?.contains(cible)) return
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
   * Molette : zoome l'emplacement survole, en mode recadrage seulement.
   * L'ecouteur est pose a la main pour pouvoir bloquer le defilement de la
   * page — React attache `onWheel` en mode passif, ou `preventDefault` est
   * sans effet.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => {
      if (mode !== 'recadrer') return
      const index = caseDuCanvas(event)
      if (index === null || !cases[index]) return
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

  /* --------------------------- Choix des photos ----------------------- */

  function togglePhoto(photo: Photo) {
    setAvis(null)

    const place = cases.indexOf(photo.id)
    if (place >= 0) {
      // Retirer laisse la case vide : les autres photos ne bougent pas.
      setCases((actuelles) => actuelles.map((id, i) => (i === place ? null : id)))
      setTransforms((actuels) => sans(actuels, photo.id))
      setEchecs((avant) => {
        const suivant = new Set(avant)
        suivant.delete(photo.id)
        return suivant
      })
      return
    }

    // Ou poser la photo : dans la case selectionnee si elle est vide, sinon
    // dans la premiere libre. Grille pleine, elle remplace la case
    // selectionnee — et sans selection, on explique plutot que d'ecraser.
    const libre = cases.indexOf(null)
    const cible =
      active !== null && cases[active] === null ? active : libre >= 0 ? libre : active
    if (cible === null) {
      setAvis(
        "La grille est complète. Retirez une photo, ou sélectionnez une case de l'aperçu pour la remplacer.",
      )
      return
    }

    const remplacee = cases[cible]
    setCases((actuelles) => actuelles.map((id, i) => (i === cible ? photo.id : id)))
    if (remplacee) setTransforms((actuels) => sans(actuels, remplacee))
  }

  async function telecharger() {
    const canvas = canvasRef.current
    if (!canvas) return

    const blob = await exportBlob(canvas, {
      layout,
      photos,
      overlay,
      transforms: transformsParCase,
      active,
      glisse: null,
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
  const photoGlissee = glisse ? photosParId.get(cases[glisse.depuis] ?? '') : undefined

  /* ------------------------ Ligne sous l'apercu ----------------------- */
  let contexte: ReactNode = null
  if (mode === 'recadrer' && active !== null && photos[active]) {
    contexte = (
      <div className="flex w-full max-w-sm items-center gap-3 rounded-xl
                      border border-ink/12 bg-white px-4 py-2.5">
        <span className="shrink-0 text-sm text-ink">Photo {active + 1}</span>
        <ZoomIn aria-hidden className="size-4 shrink-0 text-ink-soft" strokeWidth={1.75} />
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.02}
          value={(transformsParCase[active] ?? IDENTITY).zoom}
          onChange={(e) =>
            majTransform(active, (t) => ({ ...t, zoom: Number(e.target.value) }))
          }
          aria-label={`Zoom de la photo ${active + 1}`}
          className="min-w-0 flex-1 accent-[#1c1a17]"
        />
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-soft">
          {Math.round((transformsParCase[active] ?? IDENTITY).zoom * 100)} %
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
    )
  } else if (active !== null && cases[active] === null) {
    contexte = (
      <p className="text-center text-xs text-ink-soft">
        Case {active + 1} vide : cliquez une photo de la galerie pour l'y placer.
      </p>
    )
  } else if (mode === 'reorganiser' && remplies > 0) {
    contexte = (
      <p className="text-center text-xs text-ink-soft">
        Glissez une photo sur une autre case pour les échanger.
      </p>
    )
  } else if (mode === 'recadrer' && remplies > 0) {
    contexte = (
      <p className="text-center text-xs text-ink-soft">
        Cliquez une photo pour l'ajuster : glissez pour la déplacer, molette pour zoomer.
      </p>
    )
  }

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
          <div
            className="flex flex-col items-center gap-4 lg:flex-row lg:items-start
                       lg:justify-center lg:gap-5"
          >
            {/* Le canvas fait toujours 1080 × 1920 ; seul l'affichage est
                réduit, l'export garde la pleine définition. */}
            <canvas
              ref={canvasRef}
              width={STORY_WIDTH}
              height={STORY_HEIGHT}
              aria-label="Aperçu de la story"
              onPointerDown={onPointerDown}
              className={`h-auto max-h-[calc(100dvh-15rem)] w-auto max-w-full touch-none select-none
                          rounded-2xl border border-ink/10 shadow-sm lg:order-2 ${
                            glisse
                              ? '[cursor:grabbing]'
                              : mode === 'recadrer'
                                ? '[cursor:grab] active:[cursor:grabbing]'
                                : '[cursor:move]'
                          }`}
            />

            {/* Le rail : le choix du geste et l'ordre des photos. À gauche de
                l'aperçu sur grand écran — la colonne y a de la place libre, et
                la bande doit rester visible en même temps que l'image pour
                qu'on puisse glisser de l'une à l'autre. Dessous sur mobile. */}
            <div
              ref={railRef}
              className="flex flex-col items-center gap-3 lg:order-1 lg:w-36 lg:items-stretch"
            >
              <div
                role="group"
                aria-label="Geste sur l'aperçu"
                className="inline-flex shrink-0 rounded-xl border border-ink/15 bg-white p-0.5
                           lg:flex-col"
              >
                {(
                  [
                    ['recadrer', 'Recadrer', Crop],
                    ['reorganiser', 'Réorganiser', ArrowLeftRight],
                  ] as const
                ).map(([valeur, libelle, Icone]) => (
                  <button
                    key={valeur}
                    type="button"
                    onClick={() => setMode(valeur)}
                    aria-pressed={mode === valeur}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5
                                py-1.5 text-sm transition-colors ${
                                  mode === valeur
                                    ? 'bg-ink text-paper'
                                    : 'text-ink-soft hover:text-ink'
                                }`}
                  >
                    <Icone aria-hidden className="size-4" strokeWidth={1.75} />
                    {libelle}
                  </button>
                ))}
              </div>

            {/* La bande : une vignette par case, dans l'ordre des cases.
                Toujours glissable, quel que soit le mode — ici il n'y a rien
                à recadrer, donc rien à confondre. */}
            <ol
              aria-label="Ordre des photos"
              className="flex flex-wrap justify-center gap-1.5 lg:flex-col lg:flex-nowrap
                         lg:items-center"
            >
              {cases.map((id, i) => {
                const photo = id ? photosParId.get(id) : undefined
                const visee = glisse !== null && glisse.vers === i && glisse.depuis !== i
                const source = glisse?.depuis === i
                const anneau = visee
                  ? 'ring-2 ring-accent ring-offset-2 ring-offset-paper'
                  : active === i && !glisse
                    ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper'
                    : ''
                return (
                  <li key={i}>
                    <button
                      type="button"
                      data-case={i}
                      draggable={false}
                      onPointerDown={(e) => commencerGlisse(i, e)}
                      onClick={() => {
                        if (!vientDeGlisser.current) setActive(i)
                      }}
                      aria-label={
                        photo ? `Case ${i + 1} : ${photo.alt}` : `Case ${i + 1}, vide`
                      }
                      className={`relative grid size-11 touch-none select-none place-items-center
                                  overflow-hidden rounded-md transition ${
                                    photo
                                      ? 'cursor-grab bg-paper-soft'
                                      : 'border border-dashed border-ink/25 text-xs text-ink-faint'
                                  } ${source ? 'opacity-35' : ''} ${anneau}`}
                    >
                      {photo ? (
                        <>
                          <img
                            src={`${photo.thumb}&original=1`}
                            alt=""
                            draggable={false}
                            className="h-full w-full object-cover"
                          />
                          <span
                            className="absolute left-0.5 top-0.5 grid size-4 place-items-center
                                       rounded-full bg-ink/80 text-[9px] leading-none text-paper"
                          >
                            {i + 1}
                          </span>
                        </>
                      ) : (
                        i + 1
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
            </div>

            {/* Contrepoids invisible du rail : garde l'aperçu centré. */}
            <div aria-hidden className="hidden lg:order-3 lg:block lg:w-36" />
          </div>

          {/* Sous l'aperçu : le réglage de la photo choisie, puis le
              téléchargement. Une seule ligne, pour que tout tienne à l'écran
              en même temps que l'image. */}
          <div ref={commandesRef} className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <div className="flex min-h-[2.75rem] min-w-0 flex-1 basis-72 items-center justify-center">
              {contexte}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={telecharger}
              disabled={!complete || loading}
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
                {remplies} sur {attendus} photo{attendus > 1 ? 's' : ''}
              </span>
            )}
            </div>
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
                ? `${gallery.title} · ${remplies} sur ${attendus}`
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
                  Chaque photo choisie prend la première case libre — ou la case
                  sélectionnée dans l'aperçu. Un second clic la retire.
                </p>

                {avis && (
                  <p
                    role="status"
                    className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3
                               text-sm text-amber-900"
                  >
                    {avis}
                  </p>
                )}

                <ul
                  ref={galerieRef}
                  className="mt-3 grid max-h-[22rem] grid-cols-4 gap-2 overflow-y-auto pr-1"
                >
                  {gallery?.photos.map((photo) => {
                    const place = cases.indexOf(photo.id)
                    return (
                      <li key={photo.id}>
                        <button
                          type="button"
                          onClick={() => togglePhoto(photo)}
                          aria-pressed={place >= 0}
                          className={`relative block aspect-square w-full overflow-hidden rounded-lg
                                      border-2 transition ${
                                        place >= 0
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
                          {place >= 0 && (
                            <span
                              className="absolute right-1 top-1 grid size-5 place-items-center
                                         rounded-full bg-ink text-[11px] text-paper"
                            >
                              {place + 1}
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

      {/* Vignette qui suit le pointeur pendant un échange. Sa position est
          posée directement sur l'élément, sans repasser par React : un
          rendu à chaque mouvement de souris redessinerait tout le canvas. */}
      {photoGlissee && (
        <img
          ref={(el) => {
            fantome.current = el
            if (el) placerFantome()
          }}
          src={`${photoGlissee.thumb}&original=1`}
          alt=""
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-50 size-20 rounded-lg object-cover
                     opacity-90 shadow-xl ring-2 ring-white"
        />
      )}
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
