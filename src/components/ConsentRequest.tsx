import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Share2, X } from 'lucide-react'
import { answerConsent, type ConsentState } from '../lib/galleries'
import { ApiError } from '../lib/api'

/* ==================================================================
   DROIT A L'IMAGE
   ------------------------------------------------------------------
   Une demande, pas une formalite a expedier. Trois regles tenues ici :

   - « Non » est un bouton, au meme rang que « oui ». Un consentement
     qu'on ne peut pas refuser n'en est pas un.
   - Le texte complet est lisible avant de repondre, pas cache derriere
     un lien.
   - La reponse se change a tout moment.
   ================================================================== */

type Props = {
  code: string
  consent: ConsentState
  onAnswered: (consent: ConsentState) => void
  /** Ouverture pilotee par la page : le bouton de telechargement y mene. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Une reponse est exigee avant de pouvoir telecharger. */
  required?: boolean
  /** Apercu photographe : on montre, on ne repond pas. */
  readOnly?: boolean
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function ConsentRequest({
  code,
  consent,
  onAnswered,
  open,
  onOpenChange,
  required = false,
  readOnly = false,
}: Props) {
  const reduce = useReducedMotion()
  const setOpen = onOpenChange
  const [signerName, setSignerName] = useState(consent.answer?.signerName ?? '')
  const [notes, setNotes] = useState(consent.answer?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    nameRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  if (!consent.requested) return null

  async function submit(granted: boolean, event?: FormEvent) {
    event?.preventDefault()
    if (readOnly) return

    if (signerName.trim().length < 2) {
      setError('Indiquez votre nom pour que votre réponse soit tracée.')
      nameRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)
    try {
      const answer = await answerConsent(code, {
        granted,
        signerName: signerName.trim(),
        notes: notes.trim(),
      })
      onAnswered({ ...consent, answer })
      setOpen(false)
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "L'enregistrement a échoué. Réessayez.",
      )
    } finally {
      setSaving(false)
    }
  }

  const answer = consent.answer

  /* ---------------------------- La carte ---------------------------- */
  const card = answer ? (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-5 py-4 ${
        answer.granted
          ? 'border-accent/45 bg-accent-wash'
          : 'border-ink/10 bg-paper-soft'
      }`}
    >
      <p className="flex-1 text-sm text-ink">
        {answer.granted ? (
          <>
            Merci — vous avez autorisé le partage de ces photos le{' '}
            {jour(answer.decidedAt)}.
          </>
        ) : (
          <>Vous n'avez pas souhaité que ces photos soient partagées.</>
        )}
        {answer.notes && (
          <span className="mt-1 block text-ink-soft">« {answer.notes} »</span>
        )}
      </p>
      {!readOnly && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-sm text-ink-soft underline underline-offset-4
                     transition-colors hover:text-ink"
        >
          Changer d'avis
        </button>
      )}
    </div>
  ) : (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border px-5 py-4 ${
        required ? 'border-accent/50 bg-accent-wash' : 'border-ink/10 bg-paper-soft'
      }`}
    >
      <Share2 aria-hidden className="size-5 shrink-0 text-ink-soft" strokeWidth={1.75} />
      <div className="flex-1">
        <p className="text-sm text-ink">
          Puis-je partager quelques photos de cette séance pour faire connaître
          mon travail ?
        </p>
        {required && (
          // On annonce que la reponse est attendue, et aussitot que « non »
          // convient : sans cette precision, la demande ressemble a un peage.
          <p className="mt-1 text-sm text-ink-soft">
            Une réponse est nécessaire avant de télécharger vos photos.
            Un refus convient parfaitement et ne change rien au téléchargement.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm text-paper
                   transition-transform duration-150 hover:bg-ink/90
                   active:scale-[0.98] disabled:opacity-45"
      >
        Répondre
      </button>
    </div>
  )

  /* --------------------------- La fenetre --------------------------- */
  return (
    <>
      {card}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto
                       bg-ink/45 px-4 py-10 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="consent-titre"
              initial={reduce ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-xl rounded-3xl bg-paper p-6 md:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 id="consent-titre" className="text-2xl tracking-tight text-ink">
                  Autorisation de diffusion
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft
                             transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  <X aria-hidden className="size-5" strokeWidth={1.75} />
                </button>
              </div>

              {/* Le texte intégral, lisible avant de décider. */}
              <div className="mt-5 max-h-64 overflow-y-auto rounded-2xl bg-paper-soft p-5">
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  {consent.terms.text}
                </p>
              </div>

              <form onSubmit={(event) => submit(true, event)} className="mt-6 flex flex-col gap-4" noValidate>
                <div className="flex flex-col gap-2">
                  <label htmlFor="consent-nom" className="text-sm font-medium text-ink">
                    Votre nom
                  </label>
                  <input
                    id="consent-nom"
                    ref={nameRef}
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    autoComplete="name"
                    placeholder="Prénom et nom"
                    className="rounded-xl border border-ink/20 bg-white px-4 py-3 text-ink
                               placeholder:text-ink-faint transition-colors
                               hover:border-ink/35 focus:border-ink/60"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="consent-notes" className="text-sm font-medium text-ink">
                    Une réserve à formuler ?{' '}
                    <span className="font-normal text-ink-soft">(facultatif)</span>
                  </label>
                  <textarea
                    id="consent-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Ex. : d'accord, sauf les photos où les enfants apparaissent de face."
                    className="rounded-xl border border-ink/20 bg-white px-4 py-3 text-ink
                               placeholder:text-ink-faint transition-colors
                               hover:border-ink/35 focus:border-ink/60"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-rose-700">
                    {error}
                  </p>
                )}

                <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row">
                  {/* Refuser est un bouton a part entiere, pas une croix de fermeture. */}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => submit(false)}
                    className="flex-1 rounded-2xl border border-ink/20 px-6 py-3.5 text-ink-soft
                               transition-colors hover:border-ink/40 hover:text-ink
                               disabled:opacity-60"
                  >
                    Je préfère que non
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl
                               bg-ink px-6 py-3.5 text-paper transition-transform duration-150
                               hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
                  >
                    <Check aria-hidden className="size-4" strokeWidth={2} />
                    J'autorise
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
