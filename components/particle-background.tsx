"use client"

import { useEffect, useRef } from "react"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  color: string
  pulse: number
  pulseSpeed: number
}

const COLORS = [
  "249, 115, 22",   // orange-500
  "234, 88, 12",    // orange-600
  "251, 146, 60",   // orange-400
  "253, 186, 116",  // orange-300
  "255, 255, 255",  // white (sparse)
]

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const dimensionsRef = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = document.documentElement.scrollHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dimensionsRef.current = { w, h }

      // Re-init particles on resize
      initParticles(w, h)
    }

    const initParticles = (w: number, h: number) => {
      // Scale particle count: ~1 per 18000px of area, clamped
      const area = w * h
      const count = Math.min(Math.max(Math.floor(area / 18000), 30), 120)
      const particles: Particle[] = []

      for (let i = 0; i < count; i++) {
        const isWhite = Math.random() < 0.08
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.2 - 0.05, // slight upward drift
          radius: isWhite ? Math.random() * 1.2 + 0.5 : Math.random() * 2 + 0.8,
          opacity: Math.random() * 0.4 + 0.1,
          color: isWhite ? COLORS[4] : COLORS[Math.floor(Math.random() * 4)],
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.015 + 0.005,
        })
      }
      particlesRef.current = particles
    }

    const LINE_DIST = 120
    const MOUSE_DIST = 150

    const animate = () => {
      const { w, h } = dimensionsRef.current
      ctx.clearRect(0, 0, w, h)

      const particles = particlesRef.current
      const mx = mouseRef.current.x
      const my = mouseRef.current.y + window.scrollY // account for scroll

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // Update pulse
        p.pulse += p.pulseSpeed
        const pulseFactor = 0.5 + 0.5 * Math.sin(p.pulse)

        // Mouse repulsion (gentle)
        const dxm = p.x - mx
        const dym = p.y - my
        const distM = Math.sqrt(dxm * dxm + dym * dym)
        if (distM < MOUSE_DIST && distM > 0) {
          const force = (MOUSE_DIST - distM) / MOUSE_DIST * 0.02
          p.vx += (dxm / distM) * force
          p.vy += (dym / distM) * force
        }

        // Move
        p.x += p.vx
        p.y += p.vy

        // Damping
        p.vx *= 0.999
        p.vy *= 0.999

        // Wrap edges
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10

        // Draw particle with glow
        const drawOpacity = p.opacity * (0.6 + 0.4 * pulseFactor)
        const drawRadius = p.radius * (0.85 + 0.15 * pulseFactor)

        // Subtle glow
        ctx.beginPath()
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, drawRadius * 3)
        gradient.addColorStop(0, `rgba(${p.color}, ${drawOpacity * 0.3})`)
        gradient.addColorStop(1, `rgba(${p.color}, 0)`)
        ctx.fillStyle = gradient
        ctx.arc(p.x, p.y, drawRadius * 3, 0, Math.PI * 2)
        ctx.fill()

        // Core dot
        ctx.beginPath()
        ctx.arc(p.x, p.y, drawRadius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color}, ${drawOpacity})`
        ctx.fill()

        // Draw lines to nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const dx = p.x - p2.x
          const dy = p.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < LINE_DIST) {
            const lineOpacity = (1 - dist / LINE_DIST) * 0.08
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(249, 115, 22, ${lineOpacity})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    resize()
    animate()

    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseleave", handleMouseLeave)

    // Re-measure height periodically in case content changes
    const resizeInterval = setInterval(() => {
      const newH = document.documentElement.scrollHeight
      if (Math.abs(newH - dimensionsRef.current.h) > 50) {
        resize()
      }
    }, 2000)

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseleave", handleMouseLeave)
      clearInterval(resizeInterval)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0.7 }}
    />
  )
}
