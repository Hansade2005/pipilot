# PiPilot Brand Theme & Orange Accent Guide

When creating or modifying ANY UI component, you MUST follow these brand color rules exactly. PiPilot uses a consistent **orange accent** theme on a dark gray foundation.

---

## Primary Brand Colors

| Token | Tailwind Class | Usage |
|-------|---------------|-------|
| **Orange 600** | `bg-orange-600` | Primary buttons, CTAs, send buttons, user message bubbles |
| **Orange 500** | `bg-orange-500` | Hover state for buttons, sidebar indicators, progress bars, dots |
| **Orange 400** | `text-orange-400` | Accent text, active tab text, icon highlights, link text |
| **Orange 300** | `text-orange-300` | Lighter accent text, subheadings |

---

## Button Patterns

### Primary CTA Button
```
className="bg-orange-600 hover:bg-orange-500 text-white transition-colors"
```
With shadow (premium feel):
```
className="bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/20 transition-all"
```

### Send / Action Button (compact)
```
className="h-7 w-7 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
```

### Floating Action Button (circular)
```
className="h-8 w-8 rounded-full bg-orange-600 text-white hover:bg-orange-500 flex items-center justify-center shadow-lg transition-all"
```

### Ghost / Icon Button
```
className="text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10"
```

### Outline Accent Button
```
className="text-orange-400 hover:text-orange-300 border-orange-500/50 hover:border-orange-500 hover:bg-orange-500/10"
```

### Disabled State
Always use `disabled:opacity-30 disabled:cursor-not-allowed` (never gray out the color).

### Stop / Destructive Button
```
className="bg-red-500 hover:bg-red-600 text-white transition-colors"
```

---

## Input & Textarea Patterns

### Chat Input Container (card wrapper)
```
className="rounded-2xl border border-gray-700/60 bg-gray-900/80 focus-within:border-gray-600 transition-colors"
```

### Textarea (inside container)
```
className="min-h-[44px] max-h-[140px] resize-none border-0 bg-transparent text-gray-100 placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 px-3.5 pt-3 pb-2 text-sm"
```

### Standard Input Focus Ring
```
className="focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50"
```
Or stronger:
```
className="focus:outline-none focus:ring-2 focus:ring-orange-500"
```

### URL Bar / Search Input
```
className="h-8 flex-1 text-sm focus-visible:ring-1 focus-visible:ring-orange-500/50 focus-visible:border-orange-500/50"
```

---

## Tab Patterns

### Active Tab (shadcn Tabs)
```
className="data-[state=active]:bg-orange-600/15 data-[state=active]:text-orange-400"
```

### Custom Tab (manual active state)
Active: `bg-orange-600/15 text-orange-400`
Inactive: default muted styling

### Tab List Container (dark)
```
className="h-8 bg-gray-800/50"
```

---

## Sidebar & Navigation

### Active Sidebar Indicator (vertical bar)
```
className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r"
```

### Section Header Accent (left border)
```
className="w-1 h-5 bg-orange-500 rounded-sm inline-block"
```

### Navigation Icon Button
```
className="h-8 w-8 p-0 text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10"
```

### Active Mobile Tab
```
className="text-orange-400"
```
Inactive: `text-gray-500`

---

## Badge & Tag Patterns

### Solid Badge
```
className="bg-orange-500/90 text-white"
```

### Outline Badge
```
className="border-orange-500/30 text-orange-300"
```

### Subtle Background Badge
```
className="bg-orange-500/10 text-orange-500"
```

### Error Badge (keep red for errors)
```
className="bg-red-500/20 text-red-400"
```

---

## Toggle / Switch

Active state: `bg-orange-600`
Inactive state: `bg-gray-700`

---

## Card & Container Patterns

### Card Hover (subtle orange glow)
```
className="border-white/10 hover:border-orange-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10"
```

### User Message Bubble
```
className="bg-orange-600 text-white rounded-2xl rounded-br-sm"
```

### Attachment / Pill
```
className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300"
```

---

## Gradient Patterns

### Orange Gradient (badges, logos)
```
className="bg-gradient-to-br from-orange-500 to-orange-600"
```

### Subtle Orange Gradient (backgrounds)
```
className="bg-gradient-to-br from-orange-500/20 to-orange-600/10"
```

### Hero Gradient
```
className="from-orange-950 via-gray-950 to-gray-900"
```

---

## Dark Theme Foundation

| Layer | Color |
|-------|-------|
| Page background | `bg-gray-950` or `bg-[#030305]` |
| Panel background | `bg-gray-900` or `bg-gray-900/80` |
| Card / elevated surface | `bg-gray-800` |
| Border (default) | `border-gray-700/60` or `border-gray-800/60` |
| Border (focus) | `border-gray-600` or `border-orange-500/50` |
| Primary text | `text-gray-100` |
| Secondary text | `text-gray-300` |
| Muted text | `text-gray-500` or `text-muted-foreground` |
| Placeholder | `placeholder:text-gray-500` |

---

## Color Hierarchy Rules

1. **Orange 600** = base interactive state (buttons, toggles ON)
2. **Orange 500** = hover state (always 1 shade lighter than base)
3. **Orange 400** = text accent (active tabs, icons, links)
4. **Orange 500/10** = subtle hover background for ghost buttons
5. **Orange 600/15** = active tab background tint
6. **Orange 500/50** = focus rings and borders
7. **Orange 500/30** = card hover borders
8. **Orange 500/20** = box shadows for premium depth

## NEVER Do

- Never use blue or purple as a primary accent (reserved for component context indicators only)
- Never use default shadcn primary color (use orange-600 instead)
- Never use `hover:text-foreground` on icon buttons (use `hover:text-orange-400`)
- Never use `bg-primary` without overriding to orange
- Never mix green with orange for interactive states (green = success only)
- Never use focus rings without orange tint (always `ring-orange-500`)
