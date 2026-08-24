import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'

export type ConfettiHandle = { burst: () => void }

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
}

/**
 * Gerbe de confettis a la revelation d'un gagnant.
 *
 * Le canvas ne tourne que le temps de l'animation : pas de boucle rAF laissee
 * en fond, elle s'arrete d'elle-meme quand la derniere particule est retombee.
 */
export default function Confetti({ ref }: { ref?: Ref<ConfettiHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Particle[]>([])
  const running = useRef(false)
  const frame = useRef(0)

  useImperativeHandle(ref, () => ({
    burst() {
      const canvas = canvasRef.current
      if (!canvas) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      const colors = ['#cd8e64', '#a9673d', '#e7d3bf', '#1c1a17']
      for (let i = 0; i < 70; i += 1) {
        particles.current.push({
          x: canvas.width / 2 + (Math.random() - 0.5) * 260,
          y: canvas.height * 0.34,
          vx: (Math.random() - 0.5) * 7,
          vy: Math.random() * -7 - 2,
          size: Math.random() * 5 + 3,
          color: colors[Math.floor(Math.random() * colors.length)]!,
          life: 110,
        })
      }
      start()
    },
  }))

  function start() {
    if (running.current) return
    running.current = true

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const tick = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)

      for (const particle of particles.current) {
        particle.vy += 0.16
        particle.x += particle.vx
        particle.y += particle.vy
        particle.life -= 1
        context.globalAlpha = Math.max(particle.life / 110, 0)
        context.fillStyle = particle.color
        context.fillRect(particle.x, particle.y, particle.size, particle.size)
      }
      context.globalAlpha = 1
      particles.current = particles.current.filter((p) => p.life > 0)

      if (particles.current.length > 0) {
        frame.current = requestAnimationFrame(tick)
      } else {
        running.current = false
        context.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
    frame.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    return () => cancelAnimationFrame(frame.current)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
    />
  )
}
