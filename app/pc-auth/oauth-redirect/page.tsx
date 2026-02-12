"use client"

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { usePageTitle } from '@/hooks/use-page-title'

export default function OAuthRedirectPage() {
  usePageTitle('Signing In')
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        const supabase = createClient()

        // Get the current session to check if OAuth was successful
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('OAuth callback error:', error)
          toast({
            title: 'Authentication Error',
            description: 'Failed to complete GitHub authentication.',
            variant: 'destructive'
          })
          router.push('/pc-auth/login')
          return
        }

        if (session?.user) {
          toast({
            title: 'Success',
            description: 'Successfully signed in with GitHub!',
          })
          router.push('/workspace')
        } else {
          // No session found, redirect to login
          toast({
            title: 'Authentication Required',
            description: 'Please sign in to continue.',
            variant: 'destructive'
          })
          router.push('/pc-auth/login')
        }
      } catch (error) {
        console.error('OAuth redirect handler error:', error)
        toast({
          title: 'Authentication Error',
          description: 'An unexpected error occurred during authentication.',
          variant: 'destructive'
        })
        router.push('/pc-auth/login')
      }
    }

    handleOAuthCallback()
  }, [router, toast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <h2 className="text-lg font-semibold mb-2">Completing sign in...</h2>
        <p className="text-sm text-muted-foreground">Please wait while we finish setting up your account.</p>
      </div>
    </div>
  )
}
