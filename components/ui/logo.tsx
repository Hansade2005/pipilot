import { cn } from '@/lib/utils'
import Image from 'next/image'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'icon' | 'text' | 'full'
  showSubtitle?: boolean
  className?: string
}

export function Logo({ size = 'md', variant = 'icon', showSubtitle = true, className }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  }

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  }

  // Logo Image Component
  const LogoImage = ({ className }: { className?: string }) => (
    <div className={cn('relative group', className)}>
      <Image
        src="/logo.png"
        alt="PiPilot Logo"
        width={size === 'sm' ? 24 : size === 'md' ? 48 : size === 'lg' ? 48 : 64}
        height={size === 'sm' ? 24 : size === 'md' ? 48 : size === 'lg' ? 48 : 64}
        className="w-full h-full object-contain rounded-lg"
        priority
      />
    </div>
  )

  if (variant === 'icon') {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <LogoImage className={sizeClasses[size]} />
      </div>
    )
  }

  if (variant === 'text') {
    return (
      <div className={cn('flex items-center space-x-3', className)}>
        <LogoImage className={sizeClasses[size]} />
        <div className="flex flex-col">
          <span className={cn('font-bold bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 bg-clip-text text-transparent', textSizes[size])}>
            PiPilot
          </span>
          {showSubtitle && (
            <span className={cn('text-gray-300 font-medium text-xs', size === 'sm' ? 'text-xs' : size === 'md' ? 'text-xs' : size === 'lg' ? 'text-sm' : 'text-sm')}>
              Plan, build & ship faster.
            </span>
          )}
        </div>
      </div>
    )
  }

  // Full variant with larger logo and text
  return (
    <div className={cn('flex items-center space-x-4', className)}>
      <LogoImage className={sizeClasses[size]} />
      <div className="flex flex-col">
        <span className={cn('font-bold bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 bg-clip-text text-transparent', textSizes[size])}>
          PiPilot
        </span>
        <span className={cn('text-gray-300 font-medium', size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : size === 'lg' ? 'text-base' : 'text-lg')}>
          AI-Powered App Development
        </span>
      </div>
    </div>
  )
}
