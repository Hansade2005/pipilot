"use client"

import { useMemo } from "react"

interface Star {
  x: number
  y: number
  size: number
  opacity: number
  delay: number
  duration: number
  bright: boolean
}

interface Rock {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  delay: number
  duration: number
  driftX: number
  opacity: number
  borderRadius: string
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function SpaceBackground() {
  const { stars, rocks } = useMemo(() => {
    const rand = seededRandom(42)

    // Generate stars - dense starfield across the upper hero area
    const starList: Star[] = []

    // 15 bright prominent stars
    for (let i = 0; i < 15; i++) {
      starList.push({
        x: rand() * 96 + 2,
        y: rand() * 55 + 2,
        size: rand() * 3 + 2.5, // 2.5-5.5px
        opacity: rand() * 0.3 + 0.7, // 0.7-1.0
        delay: rand() * 6,
        duration: rand() * 3 + 2,
        bright: true,
      })
    }

    // 120 smaller background stars
    for (let i = 0; i < 120; i++) {
      starList.push({
        x: rand() * 100,
        y: rand() * 65,
        size: rand() * 1.8 + 0.8, // 0.8-2.6px
        opacity: rand() * 0.5 + 0.3, // 0.3-0.8
        delay: rand() * 8,
        duration: rand() * 4 + 2.5,
        bright: false,
      })
    }

    // Floating brown rocks / asteroids - various sizes
    const rockShapes = [
      "42% 58% 55% 45% / 55% 42% 58% 45%",
      "55% 45% 40% 60% / 48% 55% 45% 52%",
      "48% 52% 58% 42% / 42% 60% 40% 58%",
      "60% 40% 45% 55% / 50% 45% 55% 50%",
      "38% 62% 50% 50% / 55% 38% 62% 45%",
    ]

    const rockList: Rock[] = []
    for (let i = 0; i < 16; i++) {
      const baseSize = rand() * 8 + 4 // 4-12px
      rockList.push({
        x: rand() * 88 + 6,
        y: rand() * 50 + 5,
        width: baseSize,
        height: baseSize * (rand() * 0.4 + 0.6), // slightly squished
        rotation: rand() * 360,
        delay: rand() * 10,
        duration: rand() * 14 + 10,
        driftX: (rand() - 0.5) * 40,
        opacity: rand() * 0.35 + 0.25, // 0.25-0.6
        borderRadius: rockShapes[Math.floor(rand() * rockShapes.length)],
      })
    }

    return { stars: starList, rocks: rockList }
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-[2] overflow-hidden">
      {/* Stars */}
      {stars.map((star, i) => (
        <div
          key={`star-${i}`}
          className="absolute rounded-full space-star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            background: star.bright
              ? "radial-gradient(circle, #fff 0%, rgba(255,245,230,0.6) 50%, transparent 100%)"
              : `rgba(255, 255, 255, ${star.opacity})`,
            boxShadow: star.bright
              ? `0 0 ${star.size * 3}px rgba(255,255,255,0.5), 0 0 ${star.size * 6}px rgba(255,240,210,0.2)`
              : `0 0 ${star.size}px rgba(255,255,255,0.2)`,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}

      {/* Floating rocks/asteroids */}
      {rocks.map((rock, i) => (
        <div
          key={`rock-${i}`}
          className="absolute space-rock"
          style={{
            left: `${rock.x}%`,
            top: `${rock.y}%`,
            width: `${rock.width}px`,
            height: `${rock.height}px`,
            opacity: rock.opacity,
            transform: `rotate(${rock.rotation}deg)`,
            background: `radial-gradient(ellipse at 30% 30%, rgba(180, 140, 95, 0.95), rgba(130, 90, 55, 0.85) 45%, rgba(85, 60, 35, 0.7) 80%, rgba(60, 40, 25, 0.5) 100%)`,
            borderRadius: rock.borderRadius,
            boxShadow: `inset -1px -1px 3px rgba(0,0,0,0.5), inset 1px 1px 2px rgba(200,160,110,0.2), 0 0 ${rock.width / 2}px rgba(120, 85, 50, 0.15)`,
            animationDelay: `${rock.delay}s`,
            animationDuration: `${rock.duration}s`,
            ["--drift-x" as string]: `${rock.driftX}px`,
          }}
        />
      ))}
    </div>
  )
}
