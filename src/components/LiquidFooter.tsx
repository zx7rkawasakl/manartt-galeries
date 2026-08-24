import { motion, useReducedMotion } from 'motion/react'
// lucide 1.x a retire les icones de marque : AtSign remplace le logo Instagram.
import { AtSign, Globe, Mail } from 'lucide-react'
import logo from '../assets/logo-manartt-white.png'

export default function LiquidFooter() {
  // Les props d'animation du modele sont conservees telles quelles ; elles
  // sont neutralisees uniquement si l'utilisateur demande moins de mouvement.
  const reduce = useReducedMotion()

  return (
    <motion.footer
      initial={reduce ? false : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
      className="liquid-glass w-full rounded-3xl p-6 md:p-10 text-white/70 mt-32 md:mt-64"
    >
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <img
            src={logo}
            alt="man.artt"
            width={160}
            height={80}
            className="h-auto w-32 md:w-40"
          />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            Photographe portrait, couple et famille en Vendée.
          </p>
        </div>

        <nav aria-label="Contact" className="flex flex-col gap-3 text-sm">
          <a
            href="https://manartt.fr"
            className="inline-flex items-center gap-2 transition-colors hover:text-white"
          >
            <Globe aria-hidden className="size-4" strokeWidth={1.75} />
            manartt.fr
          </a>
          <a
            href="https://www.instagram.com/man.artt/"
            className="inline-flex items-center gap-2 transition-colors hover:text-white"
          >
            <AtSign aria-hidden className="size-4" strokeWidth={1.75} />
            man.artt
          </a>
          <a
            href="mailto:contact@manartt.fr"
            className="inline-flex items-center gap-2 transition-colors hover:text-white"
          >
            <Mail aria-hidden className="size-4" strokeWidth={1.75} />
            Me contacter
          </a>
        </nav>
      </div>

      <p className="mt-8 border-t border-white/10 pt-6 text-xs text-white/45">
        Vos photos restent votre propriété. Merci de ne pas les diffuser sans
        votre accord mutuel.
      </p>
    </motion.footer>
  )
}
