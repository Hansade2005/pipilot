"use client"

import { useMemo } from "react"

interface Star {
  x: number
  y: number
  size: number
  opacity: number
  delay: number
  duration: number
  type: "large" | "medium" | "small"
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

    const starList: Star[] = []

    // 8 large bright stars - very visible focal points
    for (let i = 0; i < 8; i++) {
      starList.push({
        x: rand() * 90 + 5,
        y: rand() * 50 + 3,
        size: rand() * 4 + 5, // 5-9px
        opacity: 1,
        delay: rand() * 5,
        duration: rand() * 2 + 2,
        type: "large",
      })
    }

    // 25 medium stars
    for (let i = 0; i < 25; i++) {
      starList.push({
        x: rand() * 96 + 2,
        y: rand() * 60 + 2,
        size: rand() * 2.5 + 2.5, // 2.5-5px
        opacity: rand() * 0.2 + 0.8, // 0.8-1.0
        delay: rand() * 6,
        duration: rand() * 3 + 2,
        type: "medium",
      })
    }

    // 100 small background stars
    for (let i = 0; i < 100; i++) {
      starList.push({
        x: rand() * 100,
        y: rand() * 65,
        size: rand() * 1.5 + 1, // 1-2.5px
        opacity: rand() * 0.4 + 0.4, // 0.4-0.8
        delay: rand() * 8,
        duration: rand() * 4 + 3,
        type: "small",
      })
    }

    // Floating brown rocks / asteroids
    const rockShapes = [
      "42% 58% 55% 45% / 55% 42% 58% 45%",
      "55% 45% 40% 60% / 48% 55% 45% 52%",
      "48% 52% 58% 42% / 42% 60% 40% 58%",
      "60% 40% 45% 55% / 50% 45% 55% 50%",
      "38% 62% 50% 50% / 55% 38% 62% 45%",
    ]

    const rockList: Rock[] = []
    for (let i = 0; i < 14; i++) {
      const baseSize = rand() * 12 + 6 // 6-18px
      rockList.push({
        x: rand() * 86 + 7,
        y: rand() * 50 + 4,
        width: baseSize,
        height: baseSize * (rand() * 0.4 + 0.55),
        rotation: rand() * 360,
        delay: rand() * 10,
        duration: rand() * 14 + 10,
        driftX: (rand() - 0.5) * 40,
        opacity: rand() * 0.3 + 0.35, // 0.35-0.65
        borderRadius: rockShapes[Math.floor(rand() * rockShapes.length)],
      })
    }

    return { stars: starList, rocks: rockList }
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-[5] overflow-hidden">
      {/* Stars */}
      {stars.map((star, i) => {
        const isLarge = star.type === "large"
        const isMedium = star.type === "medium"

        return (
          <div
            key={`star-${i}`}
            className="absolute rounded-full space-star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              background: isLarge
                ? "radial-gradient(circle, #fff 0%, rgba(255,250,240,0.8) 30%, rgba(255,240,210,0.3) 60%, transparent 100%)"
                : isMedium
                  ? "radial-gradient(circle, #fff 0%, rgba(255,245,230,0.5) 50%, transparent 100%)"
                  : "#fff",
              boxShadow: isLarge
                ? `0 0 ${star.size * 2}px rgba(255,255,255,0.8), 0 0 ${star.size * 4}px rgba(255,240,200,0.4), 0 0 ${star.size * 8}px rgba(255,230,180,0.15)`
                : isMedium
                  ? `0 0 ${star.size * 2}px rgba(255,255,255,0.5), 0 0 ${star.size * 4}px rgba(255,240,210,0.2)`
                  : `0 0 ${star.size}px rgba(255,255,255,0.3)`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
            }}
          />
        )
      })}

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
            background: `radial-gradient(ellipse at 30% 30%, rgba(190, 150, 100, 1), rgba(145, 105, 65, 0.9) 40%, rgba(100, 70, 42, 0.8) 70%, rgba(70, 48, 28, 0.6) 100%)`,
            borderRadius: rock.borderRadius,
            boxShadow: `inset -1px -1px 3px rgba(0,0,0,0.6), inset 1px 1px 2px rgba(220,180,130,0.3), 0 0 ${rock.width}px rgba(140, 100, 60, 0.2)`,
            animationDelay: `${rock.delay}s`,
            animationDuration: `${rock.duration}s`,
            ["--drift-x" as string]: `${rock.driftX}px`,
          }}
        />
      ))}
    </div>
  )
}
