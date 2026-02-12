import { Suspense } from "react"
import ResetPasswordForm from "./reset-password-form"
import type { Metadata } from 'next'


export const metadata: Metadata = {
  title: 'Reset Password | PiPilot',
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <div className="animate-pulse">
            <div className="bg-card rounded-lg p-6">
              <div className="h-8 bg-muted rounded mb-4"></div>
              <div className="h-4 bg-muted rounded mb-6"></div>
              <div className="space-y-4">
                <div className="h-10 bg-muted rounded"></div>
                <div className="h-10 bg-muted rounded"></div>
                <div className="h-10 bg-muted rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}