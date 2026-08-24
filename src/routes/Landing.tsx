import { useEffect } from 'react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { Lock } from 'lucide-react'
import CodeEntry from '../components/CodeEntry'
import LiquidFooter from '../components/LiquidFooter'

import heroLargeWebp from '../assets/hero-1672.webp'
import heroLargeJpg from '../assets/hero-1672.jpg'
import heroSmallWebp from '../assets/hero-1080.webp'
import heroSmallJpg from '../assets/hero-1080.jpg'
import logo from '../assets/logo-manartt-white.png'

export default function Landing() {
  const reduce = useReducedMotion()

  // La landing est sombre : on retire l'eventuel mode clair laisse par la galerie.
  useEffect(() => {
    document.documentElement.removeAttribute('data-surface')
  }, [])

  return (
    <main className="relative w-full min-h-[115vh] overflow-x-hidden flex flex-col items-center font-sans selection:bg-white/20 selection:text-white">
      {/* Fond immersif. Descripteurs de largeur plutot que media queries : le
          navigateur choisit selon la largeur reelle ET la densite d'ecran, et
          reevalue correctement au redimensionnement. WebP avec repli JPEG. */}
      <picture>
        <source
          type="image/webp"
          srcSet={`${heroSmallWebp} 1080w, ${heroLargeWebp} 1672w`}
          sizes="100vw"
        />
        <img
          src={heroLargeJpg}
          srcSet={`${heroSmallJpg} 1080w, ${heroLargeJpg} 1672w`}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
          className="fixed inset-0 w-full h-full object-cover z-[0]"
        />
      </picture>

      {/* Voile de lisibilite : la photo est claire (ciel pastel, sable), le texte
          blanc ne passerait pas le contraste AA sans ce degrade. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1]
                   bg-gradient-to-r from-black/80 via-black/45 to-black/10"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1]
                   bg-gradient-to-t from-black/75 via-transparent to-black/35"
      />

      {/* Contenu */}
      <div className="relative z-10 flex min-h-[115vh] w-full max-w-7xl flex-col px-6 md:px-10">
        <header className="flex items-center justify-between pt-8 md:pt-12">
          <img
            src={logo}
            alt="man.artt"
            width={160}
            height={80}
            className="h-auto w-32 md:w-40"
          />

          {/* Entree discrete pour la photographe : elle ne doit pas concurrencer
              la saisie de code, qui reste l'action principale pour le client. */}
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10
                       px-4 py-2 text-sm text-white/80 backdrop-blur-md transition-colors
                       hover:border-white/45 hover:text-white"
          >
            <Lock aria-hidden className="size-3.5" strokeWidth={1.75} />
            Espace photographe
          </Link>
        </header>

        {/* Bloc d'entree, aligne a gauche : la photographe occupe la droite du
            cadre, on ne pose pas le texte sur son visage. */}
        <section className="flex flex-1 items-center py-16">
          <div className="w-full max-w-xl">
            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="text-4xl leading-tight tracking-tight text-white md:text-6xl"
            >
              Votre galerie vous attend
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.12, ease: 'easeOut' }}
              className="mt-5 max-w-md text-lg leading-relaxed text-white/80"
            >
              Saisissez le code reçu par mail pour découvrir et télécharger vos
              photos.
            </motion.p>

            <CodeEntry />
          </div>
        </section>

        <LiquidFooter />
      </div>
    </main>
  )
}
