"use client"

import { useMemo } from "react"

interface Star {
  x: number
  y: number
  size: number
  opacity: number
  delay: number
  duration: number
}

interface Rock {
  x: number
  y: number
  size: number
  rotation: number
  delay: number
  duration: number
  driftX: number
  opacity: number
  shape: number
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

    // Generate stars - scattered across the upper 70% of viewport
    const starList: Star[] = []
    for (let i = 0; i < 80; i++) {
      starList.push({
        x: rand() * 100,
        y: rand() * 65,
        size: rand() * 2 + 0.5,
        opacity: rand() * 0.7 + 0.2,
        delay: rand() * 5,
        duration: rand() * 3 + 2,
      })
    }

    // Generate floating rocks
    const rockList: Rock[] = []
    for (let i = 0; i < 12; i++) {
      rockList.push({
        x: rand() * 90 + 5,
        y: rand() * 55 + 5,
        size: rand() * 6 + 3,
        rotation: rand() * 360,
        delay: rand() * 8,
        duration: rand() * 12 + 10,
        driftX: (rand() - 0.5) * 30,
        opacity: rand() * 0.4 + 0.15,
        shape: Math.floor(rand() * 3),
      })
    }

    return { stars: starList, rocks: rockList }
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
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
            background: star.size > 1.8
              ? "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,240,220,0.4) 60%, transparent 100%)"
              : "rgba(255, 255, 255, 0.85)",
            boxShadow: star.size > 1.5
              ? `0 0 ${star.size * 2}px rgba(255,255,255,0.3)`
              : "none",
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
            width: `${rock.size}px`,
            height: `${rock.size * (rock.shape === 0 ? 0.8 : rock.shape === 1 ? 1.1 : 0.7)}px`,
            opacity: rock.opacity,
            transform: `rotate(${rock.rotation}deg)`,
            background: `radial-gradient(ellipse at 35% 35%, rgba(160, 120, 80, 0.9), rgba(100, 70, 45, 0.7) 50%, rgba(70, 50, 30, 0.5) 100%)`,
            borderRadius: rock.shape === 0
              ? "40% 55% 45% 60%"
              : rock.shape === 1
                ? "50% 35% 55% 40%"
                : "45% 50% 40% 55%",
            boxShadow: `inset -1px -1px 2px rgba(0,0,0,0.4), 0 0 ${rock.size / 2}px rgba(100, 70, 45, 0.2)`,
            animationDelay: `${rock.delay}s`,
            animationDuration: `${rock.duration}s`,
            ["--drift-x" as string]: `${rock.driftX}px`,
          }}
        />
      ))}
    </div>
  )
}
