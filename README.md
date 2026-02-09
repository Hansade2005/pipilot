# Pipilot - AI-Powered App Development Platform

[![SPONSORED BY E2B FOR STARTUPS](https://img.shields.io/badge/SPONSORED%20BY-E2B%20FOR%20STARTUPS-ff8800?style=for-the-badge)](https://e2b.dev/startups)

A modern web application that allows users to create apps and websites by chatting with AI. Built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- **AI-Powered Development**: Create web applications through natural language conversations
- **Real-time Preview**: See your app changes instantly with live preview functionality
- **Template System**: Choose from React Vite and Next.js templates
- **Modern UI**: Beautiful, responsive design with shadcn/ui components
- **Authentication**: Secure user authentication with Supabase
- **File Management**: Advanced file explorer with VS Code-like interface
- **Custom Hooks**: 10+ reusable React hooks for common patterns
- **UI Components**: 25+ shadcn/ui components for building stunning interfaces
- **Logo System**: Custom Pipilot logo with multiple variants and animations

## Available Templates

### React Vite Template
- Modern React development with Vite
- TypeScript support
- 25+ shadcn/ui components
- 10 custom React hooks
- Hot module replacement
- Optimized build process

### Next.js Template
- Next.js 14 with App Router
- Server-side rendering (SSR)
- Static site generation (SSG)
- All shadcn/ui components from Vite template
- All custom hooks from Vite template
- Optimized for production

## Logo Component

The Pipilot logo is a sophisticated, animated component that represents AI-powered development:

### Variants
- **Icon**: Just the animated logo icon
- **Text**: Logo icon with "Pipilot" text and tagline
- **Full**: Large logo with full branding

### Sizes
- **sm**: Small (24px)
- **md**: Medium (32px) 
- **lg**: Large (48px)
- **xl**: Extra Large (64px)

### Features
- Animated gradient backgrounds
- Pixel grid pattern overlay
- Sparkle and glow effects
- Hover animations
- Responsive design
- Multiple tech-themed icons (Rocket, Sparkles, Zap, CPU, Layers)

### Usage
```tsx
import { Logo } from "@/components/ui/logo"

// Icon only
<Logo variant="icon" size="md" />

// With text
<Logo variant="text" size="lg" />

// Full branding
<Logo variant="full" size="xl" />
```

## Available Hooks

### Core Hooks
- `useLocalStorage` - Persistent state management
- `useDebounce` - Debounced value updates
- `useOnClickOutside` - Detect clicks outside elements
- `useMediaQuery` - Responsive design utilities
- `useCopyToClipboard` - Copy text to clipboard
- `useInterval` - Interval-based effects
- `usePrevious` - Track previous values
- `useToggle` - Boolean state management
- `useMobile` - Mobile device detection
- `useToast` - Toast notification management

## UI Components

### Essential Components
- Button, Card, Input, Label
- Alert, Badge, Dialog, Dropdown Menu
- Checkbox, Select, Textarea, Switch
- Tabs, Tooltip, Avatar, Separator
- Accordion, Popover, Progress, Slider
- Breadcrumb, Skeleton, Sonner, Table
- Form, Calendar, Data Table, Carousel
- Sheet, Command, Toast, Collapsible
- Scroll Area, Pagination

## Project Structure

```
ai-app-builder/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── chat-input.tsx    # Chat interface
│   └── auth-modal.tsx    # Authentication modal
├── lib/                  # Utility libraries
│   ├── supabase/         # Supabase client
│   ├── storage-manager.ts # File storage
│   └── template-service.ts # Template management
├── hooks/                # Custom React hooks
└── public/               # Static assets
```

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run the development server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
E2B_API_KEY=your_e2b_api_key
```

## Technologies Used

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **Backend**: Supabase (Auth, Database, Storage)
- **AI Integration**: E2B Sandbox for previews
- **Icons**: Lucide React
- **Animations**: CSS animations and Tailwind utilities

## License

MIT License - see LICENSE file for details.
