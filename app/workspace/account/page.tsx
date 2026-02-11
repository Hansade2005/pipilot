"use client"

import React, { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  User,
  Mail,
  Lock,
  Trash2,
  RefreshCw,
  Cloud,
  CloudOff,
  CheckCircle,
  AlertCircle,
  Info,
  ExternalLink,
  Unlink,
  Loader2,
  Check,
  X,
  Edit3,
  CreditCard,
  TrendingUp,
  Zap,
  Calendar,
  Download,
  Settings,
  Crown,
  BarChart3,
  Receipt,
  AlertTriangle,
  Plus,
  Coins,
  Wrench,
  Server,
  Code,
  Database,
  Globe,
  FileText,
  Search,
  Terminal,
  Palette,
  Shield
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { storageManager } from "@/lib/storage-manager"
import { PRODUCT_CONFIGS, getLimits } from "@/lib/stripe-config"
import {
  uploadBackupToCloud,
  restoreBackupFromCloud,
  isCloudSyncEnabled as isCloudSyncEnabledUtil,
  isCloudSyncEnabled,
  setCloudSyncEnabled as setCloudSyncEnabledUtil,
  getLastBackupTime as getLastBackupTimeUtil,
  storeDeploymentTokens,
  getDeploymentTokens,
  storeDeploymentConnectionStates,
  getDeploymentConnectionStates,
  storeSupabaseProjectDetails,
  getSupabaseProjectDetails
} from "@/lib/cloud-sync"
import { useCloudSync } from "@/hooks/use-cloud-sync"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CreditTopUpSelector } from "@/components/billing/credit-topup-selector"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

// Custom SVG Icons
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>GitHub</title>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
)

const VercelIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Vercel</title>
    <path d="m12 1.608 12 20.784H0Z" />
  </svg>
)

const NetlifyIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Netlify</title>
    <path d="M6.49 19.04h-.23L5.13 17.9v-.23l1.73-1.71h1.2l.15.15v1.2L6.5 19.04ZM5.13 6.31V6.1l1.13-1.13h.23L8.2 6.68v1.2l-.15.15h-1.2L5.13 6.31Zm9.96 9.09h-1.65l-.14-.13v-3.83c0-.68-.27-1.2-1.1-1.23-.42 0-.9 0-1.43.02l-.07.08v4.96l-.14.14H8.9l-.13-.14V8.73l.13-.14h3.7a2.6 2.6 0 0 1 2.61 2.6v4.08l-.13.14Zm-8.37-2.44H.14L0 12.82v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14Zm17.14 0h-6.58l-.14-.14v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14ZM11.05 6.55V1.64l.14-.14h1.65l.14.14v4.9l-.14.14h-1.65l-.14-.13Zm0 15.81v-4.9l.14-.14h1.65l.14.13v4.91l-.14.14h-1.65l-.14-.14Z" />
  </svg>
)

const SupabaseIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Supabase</title>
    <path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.724 9.355H.642A.643.643 0 0 0 0 10v4a.64.64 0 0 0 .643.643h2.724l8.56 9.192a.396.396 0 0 0 .716-.233V14.61h9.362a.643.643 0 0 0 .643-.643v-4a.643.643 0 0 0-.643-.643Z" />
  </svg>)
const StripeIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Stripe</title>
    <path d="M13.976 9.15c-1.37 0-2.313.917-2.313 2.445 0 2.807 4.878 1.47 4.878 4.435 0 .871-.776 1.428-1.958 1.428-1.618 0-2.413-.854-2.413-2.165h-2.03c0 2.145 1.618 3.507 4.443 3.507 1.618 0 2.783-.661 2.783-2.445 0-2.806-4.878-1.47-4.878-4.435 0-.661.465-1.244 1.754-1.244 1.244 0 1.863.661 1.863 1.754h2.03c0-1.754-1.37-2.807-3.559-2.807zm7.024 8.85h2.03V6.22h-2.03v11.78z" />
  </svg>
)

function AccountSettingsPageContent() {
  const { toast } = useToast()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState(false)
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [backupStatus, setBackupStatus] = useState<"idle" | "syncing" | "success" | "error">("idle")

  // Auto-restore state
  const [isAutoRestoring, setIsAutoRestoring] = useState(false)

  // Profile editing state
  const [isEditingName, setIsEditingName] = useState(false)
  const [editingName, setEditingName] = useState("")
  const [isUpdatingName, setIsUpdatingName] = useState(false)

  // Initialize auto cloud backup when user is available
  const { triggerBackup, getSyncStatus } = useCloudSync(user?.id || null)

  // Connection status states
  const [connections, setConnections] = useState<{
    github: { connected: boolean; username: string; avatarUrl: string; loading: boolean };
    vercel: { connected: boolean; username: string; avatarUrl: string; loading: boolean };
    netlify: { connected: boolean; username: string; avatarUrl: string; loading: boolean };
    supabase: { connected: boolean; username: string; avatarUrl: string; loading: boolean; projects: any[]; selectedProject: any | null };
    stripe: { connected: boolean; username: string; avatarUrl: string; loading: boolean };
  }>({
    github: { connected: false, username: '', avatarUrl: '', loading: false },
    vercel: { connected: false, username: '', avatarUrl: '', loading: false },
    netlify: { connected: false, username: '', avatarUrl: '', loading: false },
    supabase: { connected: false, username: '', avatarUrl: '', loading: false, projects: [], selectedProject: null },
    stripe: { connected: false, username: '', avatarUrl: '', loading: false }
  })

  // Connection form states
  const [connectionForms, setConnectionForms] = useState({
    github: { token: '', isValidating: false, error: '' },
    vercel: { token: '', isValidating: false, error: '' },
    netlify: { token: '', isValidating: false, error: '' },
    supabase: { token: '', anonKey: '', serviceRoleKey: '', isValidating: false, error: '' },
    stripe: { token: '', isValidating: false, error: '' }
  })

  // Password change form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  })

  // Subscription state
  const [subscription, setSubscription] = useState<any>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [usageStats, setUsageStats] = useState({
    deploymentsThisMonth: 0,
    githubPushesThisMonth: 0,
    storageUsed: 0
  })

  // Credits/Balance states
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [estimatedMessages, setEstimatedMessages] = useState<number>(0)
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [showTopUpDialog, setShowTopUpDialog] = useState(false)
  const [topUpAmount, setTopUpAmount] = useState('10')
  const [processingTopUp, setProcessingTopUp] = useState(false)

  // Delete account state
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  // Tool preferences state
  const [disabledToolCategories, setDisabledToolCategories] = useState<string[]>([])

  const supabase = createClient()
  const searchParams = useSearchParams()

  // Handle OAuth callback parameters
  // Load tool preferences from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pipilot-tool-preferences')
      if (stored) {
        const parsed = JSON.parse(stored)
        setDisabledToolCategories(parsed.disabledCategories || [])
      }
    } catch {}
  }, [])

  const toggleToolCategory = (category: string) => {
    setDisabledToolCategories(prev => {
      const next = prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
      localStorage.setItem('pipilot-tool-preferences', JSON.stringify({ disabledCategories: next }))
      return next
    })
  }

  useEffect(() => {
    const handleOAuthCallback = async () => {
      const token = searchParams.get('token')
      const processed = searchParams.get('processed')

      console.log('[OAUTH] Current URL:', window.location.href)
      console.log('[OAUTH] handleOAuthCallback called:', {
        hasToken: !!token,
        tokenLength: token?.length || 0,
        hasUser: !!user?.id,
        userId: user?.id,
        processed: processed
      })

      // Only process if we have a token and haven't processed it yet
      if (token && user?.id && !processed) {
        console.log('[OAUTH] Starting OAuth callback processing...')
        try {
          // Mark as processed to prevent re-processing
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.set('processed', 'true')
          window.history.replaceState({}, document.title, newUrl.pathname + newUrl.search)

          // First validate the token before storing it
          console.log('[OAUTH] Validating Supabase OAuth token...')

          // Call our server-side API to validate the token (avoids CORS issues)
          console.log('[OAUTH] Calling server API to validate token...')
          const validateResponse = await fetch('/api/supabase/validate-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          })

          const validateResult = await validateResponse.json()

          if (!validateResponse.ok || !validateResult.valid) {
            throw new Error(validateResult.error || 'Token validation failed')
          }

          const projects = validateResult.projects || []
          console.log('[OAUTH] Token validation successful, found', projects.length, 'projects')

          // Store the Supabase access token only after validation
          console.log('[OAUTH] Storing token and connection state...')
          const tokensToStore: any = { supabase: token }
          const success = await storeDeploymentTokens(user.id, tokensToStore)

          if (!success) {
            console.error('[OAUTH] Failed to store token in database')
            throw new Error('Failed to save your Supabase token to the database. Please try again or contact support if the issue persists.')
          }

          console.log('[OAUTH] Token stored successfully')
          // Store connection state
          const statesToStore: any = { supabase_connected: true }
          const connectionSuccess = await storeDeploymentConnectionStates(user.id, statesToStore)

          if (!connectionSuccess) {
            console.error('[OAUTH] Failed to store connection state')
            throw new Error('Token saved but failed to update connection status. Please refresh the page.')
          }

          console.log('[OAUTH] Connection state stored successfully')

          // Refresh connection status to show the new connection
          console.log('[OAUTH] Calling checkConnectionStatus after successful token storage...')
          try {
            await checkConnectionStatus(user.id)
            console.log('[OAUTH] checkConnectionStatus completed successfully')
          } catch (connectionCheckError: any) {
            console.error('[OAUTH] checkConnectionStatus failed:', connectionCheckError)
            // Don't throw here, as the token was saved successfully
            // Just log the error and continue
          }

          // Clear URL parameters
          window.history.replaceState({}, document.title, window.location.pathname)

          toast({
            title: "Connected to Supabase",
            description: `Successfully connected to Supabase via OAuth (${projects?.length || 0} projects available)`,
          })
        } catch (error: any) {
          console.error("Error handling OAuth callback:", error)

          // Clear URL parameters even on error
          window.history.replaceState({}, document.title, window.location.pathname)

          // Provide specific error messages based on the error type
          let errorMessage = "Failed to complete Supabase connection. Please try again."

          if (error.message?.toLowerCase().includes('unauthorized') ||
            error.message?.toLowerCase().includes('invalid') ||
            error.message?.toLowerCase().includes('403')) {
            errorMessage = "The OAuth token received is invalid or expired. Please try connecting again through OAuth."
          } else if (error.message?.toLowerCase().includes('network') ||
            error.message?.toLowerCase().includes('fetch') ||
            error.message?.toLowerCase().includes('timeout')) {
            errorMessage = "Network error during token validation. Please check your internet connection and try again."
          } else if (error.message?.includes('Failed to store')) {
            errorMessage = "Token validation succeeded but failed to save your connection. Please try again."
          } else if (error.message?.toLowerCase().includes('projects')) {
            errorMessage = "Failed to fetch your Supabase projects. Your token may not have the required permissions."
          } else if (error.message) {
            // Use the actual error message if it's descriptive
            errorMessage = `Connection failed: ${error.message}`
          }

          toast({
            title: "Connection Failed",
            description: errorMessage,
            variant: "destructive"
          })
        }
      } else {
        if (token && !user?.id) {
          console.log('[OAUTH] Token found but no user available yet, waiting...')
        } else if (!token) {
          console.log('[OAUTH] No token in URL parameters')
        } else if (processed) {
          console.log('[OAUTH] Token already processed, skipping')
        }
      }
    }

    if (user?.id) {
      console.log('[OAUTH] User available, starting OAuth callback handler...')
      handleOAuthCallback()
    } else {
      console.log('[OAUTH] No user available yet for OAuth callback')
    }
  }, [user?.id])

  useEffect(() => {
    fetchUser()
  }, [])

  useEffect(() => {
    if (user?.id) {
      checkCloudSyncStatus(user.id)
      checkConnectionStatus(user.id)
      fetchSubscriptionStatus(user.id)
      // Fetch immediately then refresh every 5 seconds for near real-time updates
      fetchCreditBalance(user.id, true) // isInitial = true
      const interval = setInterval(() => fetchCreditBalance(user.id, false), 5000) // isInitial = false
      return () => clearInterval(interval)

      // Auto-restore is disabled on account page - only available in workspace with project ID
      console.log('Account page: Auto-restore is disabled on this page')
    }
  }, [user])

  // Handle name editing
  const handleStartEditingName = () => {
    setEditingName(user?.user_metadata?.full_name || "")
    setIsEditingName(true)
  }

  const handleCancelEditingName = () => {
    setEditingName("")
    setIsEditingName(false)
  }

  const handleSaveName = async () => {
    if (!user || !editingName.trim()) return

    try {
      setIsUpdatingName(true)

      // Update auth user metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: editingName.trim()
        }
      })

      if (authError) throw authError

      // Also update the profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: editingName.trim(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })

      if (profileError) {
        console.error("Error updating profile:", profileError)
        // Don't throw here, auth update was successful
      }

      // Update local user state
      setUser({
        ...user,
        user_metadata: {
          ...user.user_metadata,
          full_name: editingName.trim()
        }
      })

      setIsEditingName(false)
      setEditingName("")

      toast({
        title: "Name updated",
        description: "Your name has been successfully updated.",
      })
    } catch (error: any) {
      console.error("Error updating name:", error)
      toast({
        title: "Failed to update name",
        description: error.message || "An error occurred while updating your name.",
        variant: "destructive"
      })
    } finally {
      setIsUpdatingName(false)
    }
  }

  // Validate and connect to a provider
  const handleConnect = async (provider: 'github' | 'vercel' | 'netlify' | 'supabase' | 'stripe') => {
    const token = connectionForms[provider].token
    if (!token.trim()) {
      setConnectionForms(prev => ({
        ...prev,
        [provider]: { ...prev[provider], error: 'Please enter a token' }
      }))
      return
    }

    try {
      setConnectionForms(prev => ({
        ...prev,
        [provider]: { ...prev[provider], isValidating: true, error: '' }
      }))

      let userData: any = {}

      // Validate token based on provider
      if (provider === 'github') {
        const response = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        })
        if (!response.ok) throw new Error('Invalid GitHub token')
        userData = await response.json()
      } else if (provider === 'vercel') {
        const response = await fetch('https://api.vercel.com/v1/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        if (!response.ok) throw new Error('Invalid Vercel token')
        userData = await response.json()
      } else if (provider === 'netlify') {
        const response = await fetch('https://api.netlify.com/api/v1/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        if (!response.ok) throw new Error('Invalid Netlify token')
        userData = await response.json()
      } else if (provider === 'supabase') {
        // Use server-side API to validate token (avoids CORS issues)
        console.log('[SUPABASE] Validating manual access token...')

        const validateResponse = await fetch('/api/supabase/validate-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        })

        const validateResult = await validateResponse.json()

        if (!validateResponse.ok || !validateResult.valid) {
          const errorMessage = validateResult.error || 'Token validation failed'
          console.error('[SUPABASE] Manual token validation failed:', errorMessage)

          if (errorMessage.toLowerCase().includes('unauthorized') ||
            errorMessage.toLowerCase().includes('invalid') ||
            errorMessage.toLowerCase().includes('403')) {
            throw new Error(`Invalid Supabase Management API token. Please ensure you're using a Management API token from https://supabase.com/dashboard/account/tokens, not an anon or service role key.`)
          } else if (errorMessage.toLowerCase().includes('network') ||
            errorMessage.toLowerCase().includes('fetch')) {
            throw new Error('Network error while validating token. Please check your internet connection and try again.')
          } else {
            throw new Error(`Failed to validate Supabase token: ${errorMessage}. Please ensure you have the correct Management API token.`)
          }
        }

        const projects = validateResult.projects || []
        console.log('[SUPABASE] Manual token validation successful, found', projects.length, 'projects')
        userData = { name: 'Supabase User', projects } // Include projects in userData
      }

      // Save token to Supabase
      const tokensToStore: any = {}
      tokensToStore[provider] = token
      const success = await storeDeploymentTokens(user.id, tokensToStore)

      if (!success) {
        throw new Error(`Failed to store ${provider} token`)
      }

      // Store connection state
      const statesToStore: any = {}
      statesToStore[`${provider}_connected`] = true
      await storeDeploymentConnectionStates(user.id, statesToStore)

      // Auto-run auth back: re-check connection status to validate token and fetch user data
      await checkConnectionStatus(user.id)

      // Clear form
      setConnectionForms(prev => ({
        ...prev,
        [provider]: { token: '', isValidating: false, error: '' }
      }))

      toast({
        title: "Connected",
        description: `Successfully connected to ${provider.charAt(0).toUpperCase() + provider.slice(1)}`,
      })
    } catch (error: any) {
      console.error(`Error connecting to ${provider}:`, error)
      setConnectionForms(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          isValidating: false,
          error: error.message || `Failed to validate ${provider} token`
        }
      }))
    }
  }


  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        // Cloud sync status will be checked in the useEffect that watches user changes
      }
    } catch (error) {
      console.error("Error fetching user:", error)
      toast({
        title: "Error",
        description: "Failed to fetch user information",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const checkCloudSyncStatus = async (userId?: string) => {
    try {
      const id = userId || user?.id
      if (!id) return

      const enabled = await isCloudSyncEnabledUtil(id)
      setCloudSyncEnabledState(enabled)

      const lastBackupTime = await getLastBackupTimeUtil(id)
      setLastBackup(lastBackupTime)
    } catch (error) {
      console.error("Error checking cloud sync status:", error)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive"
      })
      return
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive"
      })
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      })

      if (error) throw error

      toast({
        title: "Success",
        description: "Password updated successfully"
      })

      // Reset form
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      })
    } catch (error: any) {
      console.error("Error updating password:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to update password",
        variant: "destructive"
      })
    }
  }

  const toggleCloudSync = async () => {
    try {
      if (!user?.id) {
        toast({
          title: "Error",
          description: "User not authenticated",
          variant: "destructive"
        })
        return
      }

      const newStatus = !cloudSyncEnabled

      // Update in Supabase
      const success = await setCloudSyncEnabledUtil(user.id, newStatus)

      if (!success) throw new Error("Failed to update cloud sync settings")

      setCloudSyncEnabledState(newStatus)

      toast({
        title: "Success",
        description: `Cloud sync ${newStatus ? 'enabled' : 'disabled'}`
      })
    } catch (error: any) {
      console.error("Error toggling cloud sync:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to update cloud sync settings",
        variant: "destructive"
      })
    }
  }

  const triggerManualBackup = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive"
      })
      return
    }

    setBackupStatus("syncing")

    try {
      const success = await uploadBackupToCloud(user.id)

      if (!success) throw new Error("Backup failed")

      // Update last backup time
      const lastBackupTime = await getLastBackupTimeUtil(user.id)
      setLastBackup(lastBackupTime)

      setBackupStatus("success")

      toast({
        title: "Success",
        description: "Backup completed successfully"
      })
    } catch (error: any) {
      console.error("Error creating backup:", error)
      setBackupStatus("error")

      toast({
        title: "Error",
        description: error.message || "Failed to create backup",
        variant: "destructive"
      })
    } finally {
      setTimeout(() => setBackupStatus("idle"), 3000)
    }
  }

  const handleRestoreBackup = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive"
      })
      return
    }

    setBackupStatus("syncing")

    try {
      const success = await restoreBackupFromCloud(user.id)

      if (!success) throw new Error("Restore failed")

      setBackupStatus("success")

      toast({
        title: "Success",
        description: "Backup restored successfully. Please refresh the page to see changes."
      })
    } catch (error: any) {
      console.error("Error restoring backup:", error)
      setBackupStatus("error")

      toast({
        title: "Error",
        description: error.message || "Failed to restore backup",
        variant: "destructive"
      })
    } finally {
      setTimeout(() => setBackupStatus("idle"), 3000)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE MY ACCOUNT") {
      toast({
        title: "Error",
        description: "Please type 'DELETE MY ACCOUNT' to confirm",
        variant: "destructive"
      })
      return
    }

    setIsDeleting(true)

    try {
      // Delete user data from Supabase tables
      const tables = ['workspaces', 'files', 'deployments', 'environment_variables', 'chat_sessions', 'messages', 'user_settings', 'user_backups']

      for (const table of tables) {
        await supabase
          .from(table)
          .delete()
          .eq('user_id', user?.id)
      }

      // Delete the user account itself
      const { error } = await supabase.auth.admin.deleteUser(user?.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Account deleted successfully"
      })

      // Redirect to home or login page
      window.location.href = "/"
    } catch (error: any) {
      console.error("Error deleting account:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const validateAndStoreToken = async (provider: 'github' | 'vercel' | 'netlify', token: string) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive"
      })
      return false
    }

    // Reset validation state
    setConnectionForms(prev => ({
      ...prev,
      [provider]: { ...prev[provider], isValidating: true, error: '' }
    }))

    try {
      // Validate token (you'll need to implement these validation methods)
      const isValid = await validateDeploymentToken(provider, token)

      if (!isValid) {
        throw new Error(`Invalid ${provider} token`)
      }

      // Store token using Supabase
      const tokensToStore: any = {}
      tokensToStore[provider] = token
      const success = await storeDeploymentTokens(user.id, tokensToStore)

      if (!success) {
        throw new Error(`Failed to store ${provider} token`)
      }

      // Store connection state
      const statesToStore: any = {}
      statesToStore[`${provider}_connected`] = true
      await storeDeploymentConnectionStates(user.id, statesToStore)

      // Auto-run auth back: re-check connection status to validate token and fetch user data
      await checkConnectionStatus(user.id)

      // Update connection status
      setConnections(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          connected: true,
          loading: false
        }
      }))

      toast({
        title: "Success",
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} token validated and stored`
      })

      return true
    } catch (error: any) {
      console.error(`Error validating ${provider} token:`, error)

      setConnectionForms(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          isValidating: false,
          error: error.message || `Failed to validate ${provider} token`
        }
      }))

      toast({
        title: "Error",
        description: error.message || `Failed to validate ${provider} token`,
        variant: "destructive"
      })

      return false
    }
  }

  // Fetch existing connection status and validate tokens
  const checkConnectionStatus = async (userId: string) => {
    try {
      // Get tokens, connection states, and Supabase project details from Supabase
      const [tokens, connectionStates, supabaseProjectDetails] = await Promise.all([
        getDeploymentTokens(userId),
        getDeploymentConnectionStates(userId),
        getSupabaseProjectDetails(userId)
      ])

      // Set loading state for all providers
      setConnections(prev => ({
        github: { ...prev.github, loading: true },
        vercel: { ...prev.vercel, loading: true },
        netlify: { ...prev.netlify, loading: true },
        supabase: { ...prev.supabase, loading: true },
        stripe: { ...prev.stripe, loading: true }
      }))

      // Validate and fetch user data for each token
      const validateAndFetchUserData = async (
        provider: 'github' | 'vercel' | 'netlify' | 'supabase' | 'stripe'
      ) => {
        const token = tokens?.[provider]
        const isConnected = connectionStates?.[`${provider}_connected`] || false

        if (!token || !isConnected) {
          return { connected: false, username: '', avatarUrl: '', loading: false, projects: undefined, selectedProject: null }
        }

        try {
          let userData: any = {}

          // Validate token and fetch user data
          if (provider === 'github') {
            const response = await fetch('https://api.github.com/user', {
              headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            })
            if (!response.ok) throw new Error('Invalid GitHub token')
            userData = await response.json()
          } else if (provider === 'vercel') {
            const response = await fetch('https://api.vercel.com/v1/user', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            })
            if (!response.ok) throw new Error('Invalid Vercel token')
            userData = await response.json()
          } else if (provider === 'netlify') {
            const response = await fetch('https://api.netlify.com/api/v1/user', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            })
            if (!response.ok) throw new Error('Invalid Netlify token')
            userData = await response.json()
          } else if (provider === 'supabase') {
            // Use server-side API to validate token and fetch projects (avoids CORS issues)
            console.log('[SUPABASE] Validating access token...')

            const validateResponse = await fetch('/api/supabase/validate-token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token }),
            })

            const validateResult = await validateResponse.json()

            if (!validateResponse.ok || !validateResult.valid) {
              throw new Error(validateResult.error || 'Invalid Supabase Management API access token. Please ensure you\'re using a Management API token from https://supabase.com/dashboard/account/tokens, not an anon or service role key.')
            }

            const projects = validateResult.projects || []
            console.log('[SUPABASE] Token validation successful, found', projects.length, 'projects')
            userData = { name: 'Supabase User', projects }
          } else if (provider === 'stripe') {
            // Validate Stripe secret key by making a test API call
            console.log('[STRIPE] Validating secret key...')

            const response = await fetch('https://api.stripe.com/v1/account', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            })

            if (!response.ok) {
              throw new Error('Invalid Stripe secret key')
            }

            userData = await response.json()
            console.log('[STRIPE] Secret key validation successful')
          }

          return {
            connected: true,
            username: provider === 'github' ? userData.login :
              provider === 'vercel' ? (userData.username || userData.name) :
                provider === 'supabase' ? userData.name :
                  provider === 'stripe' ? (userData.business_name || userData.email || 'Stripe Account') :
                    (userData.login || userData.email),
            avatarUrl: provider === 'github' ? userData.avatar_url :
              provider === 'vercel' ? userData.avatar :
                provider === 'supabase' ? '' :
                  provider === 'stripe' ? '' :
                    userData.avatar_url,
            loading: false,
            projects: provider === 'supabase' ? userData.projects : undefined,
            selectedProject: provider === 'supabase' ? null : undefined
          }
        } catch (error) {
          console.error(`Error validating ${provider} token:`, error)
          // If token is invalid, remove it and update connection state from Supabase
          try {
            const tokensToUpdate: any = {}
            tokensToUpdate[provider] = null
            await storeDeploymentTokens(userId, tokensToUpdate)

            const statesToUpdate: any = {}
            statesToUpdate[`${provider}_connected`] = false
            await storeDeploymentConnectionStates(userId, statesToUpdate)
          } catch (deleteError) {
            console.error(`Error removing invalid ${provider} token:`, deleteError)
          }
          return { connected: false, username: '', avatarUrl: '', loading: false, projects: undefined, selectedProject: null }
        }
      }

      // Validate all tokens concurrently
      console.log('[CONNECTION_STATUS] Starting validation for all providers...')
      const [githubStatus, vercelStatus, netlifyStatus, supabaseStatus, stripeStatus] = await Promise.all([
        validateAndFetchUserData('github'),
        validateAndFetchUserData('vercel'),
        validateAndFetchUserData('netlify'),
        validateAndFetchUserData('supabase'),
        validateAndFetchUserData('stripe')
      ])
      console.log('[CONNECTION_STATUS] Validation results:', {
        github: githubStatus.connected,
        vercel: vercelStatus.connected,
        netlify: netlifyStatus.connected,
        supabase: supabaseStatus.connected,
        stripe: stripeStatus.connected
      })

      // Update connection status
      console.log('[CONNECTION_STATUS] Updating UI state...')
      setConnections({
        github: githubStatus,
        vercel: vercelStatus,
        netlify: netlifyStatus,
        supabase: {
          ...supabaseStatus,
          selectedProject: supabaseProjectDetails?.selectedProjectId && supabaseProjectDetails?.selectedProjectName ? {
            id: supabaseProjectDetails.selectedProjectId,
            name: supabaseProjectDetails.selectedProjectName
          } : supabaseStatus.selectedProject
        },
        stripe: stripeStatus
      })
      console.log('[CONNECTION_STATUS] UI state updated')

    } catch (error) {
      console.error("Error checking connection status:", error)
      // Reset loading states on error
      setConnections(prev => ({
        github: { ...prev.github, loading: false },
        vercel: { ...prev.vercel, loading: false },
        netlify: { ...prev.netlify, loading: false },
        supabase: { ...prev.supabase, loading: false },
        stripe: { ...prev.stripe, loading: false }
      }))
    }
  }

  const fetchSubscriptionStatus = async (userId: string) => {
    try {
      setSubscriptionLoading(true)

      // Fetch subscription directly from database
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: userSettings, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (!settingsError && userSettings) {
        const subscriptionData = {
          plan: userSettings.subscription_plan || 'free',
          status: userSettings.subscription_status || 'active',
          deploymentsThisMonth: userSettings.deployments_this_month || 0,
          githubPushesThisMonth: userSettings.github_pushes_this_month || 0,
          subscriptionEndDate: userSettings.cancel_at_period_end ? userSettings.updated_at : undefined,
          cancelAtPeriodEnd: userSettings.cancel_at_period_end || false
        }

        setSubscription(subscriptionData)

        // Update usage stats based on subscription
        setUsageStats(prev => ({
          ...prev,
          deploymentsThisMonth: subscriptionData.deploymentsThisMonth,
          githubPushesThisMonth: subscriptionData.githubPushesThisMonth
        }))
      }
    } catch (error) {
      console.error("Error fetching subscription status:", error)
    } finally {
      setSubscriptionLoading(false)
    }
  }

  const handleUpgradePlan = (planType: string) => {
    // Redirect to pricing page with plan selection
    window.location.href = `/pricing?upgrade=${planType}`
  }

  const handleCancelSubscription = async () => {
    if (!subscription?.plan || subscription.plan === 'free') return

    try {
      // Here you would implement cancellation logic
      toast({
        title: "Subscription Management",
        description: "Please contact support to cancel your subscription.",
      })
    } catch (error) {
      console.error("Error cancelling subscription:", error)
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please contact support.",
        variant: "destructive"
      })
    }
  }

  const handleManageBilling = async () => {
    try {
      setSubscriptionLoading(true)

      // Check which payment provider the user has
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('payment_provider')
        .eq('user_id', user?.id)
        .single()

      const paymentProvider = userSettings?.payment_provider || 'stripe'

      if (paymentProvider === 'polar') {
        // Redirect to Polar customer portal
        window.location.href = '/api/polar/portal'
      } else {
        // Redirect to Stripe billing portal
        const response = await fetch('/api/stripe/create-portal-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create billing portal session')
        }

        window.location.href = data.url
      }
    } catch (error: any) {
      console.error('Error creating billing portal session:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to open billing portal. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setSubscriptionLoading(false)
    }
  }

  // Disconnect from a provider
  const handleDisconnect = async (provider: 'github' | 'vercel' | 'netlify' | 'supabase' | 'stripe') => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive"
      })
      return
    }

    try {
      // Remove token from Supabase
      const tokensToUpdate: any = {}
      tokensToUpdate[provider] = null
      await storeDeploymentTokens(user.id, tokensToUpdate)

      // Update connection state
      const statesToUpdate: any = {}
      statesToUpdate[`${provider}_connected`] = false
      await storeDeploymentConnectionStates(user.id, statesToUpdate)

      // Auto-run auth back: re-check connection status
      await checkConnectionStatus(user.id)

      // Clear the form input
      setConnectionForms(prev => ({
        ...prev,
        [provider]: { token: '', isValidating: false, error: '' }
      }))

      toast({
        title: "Success",
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} disconnected successfully`
      })
    } catch (error: any) {
      console.error(`Error disconnecting ${provider}:`, error)
      toast({
        title: "Error",
        description: error.message || `Failed to disconnect ${provider}`,
        variant: "destructive"
      })
    }
  }

  const handleCreateSupabaseProject = async () => {
    if (!user?.id || !connections.supabase.connected) {
      toast({
        title: "Error",
        description: "Not connected to Supabase",
        variant: "destructive"
      })
      return
    }

    try {
      // Get the access token
      const tokens = await getDeploymentTokens(user.id)
      const accessToken = tokens?.supabase

      if (!accessToken) {
        throw new Error("No Supabase access token found")
      }

      // Use Dyad Supabase Management API to create project
      const { SupabaseManagementAPI } = await import('@dyad-sh/supabase-management-js')
      const client = new SupabaseManagementAPI({ accessToken })

      // For now, we'll open Supabase dashboard for project creation
      // In a future implementation, we could use the API to create projects programmatically
      window.open('https://supabase.com/dashboard/projects', '_blank')

      toast({
        title: "Opening Supabase Dashboard",
        description: "Please create your new project in the Supabase dashboard, then refresh this page to see it in the list."
      })
    } catch (error: any) {
      console.error("Error creating Supabase project:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create Supabase project",
        variant: "destructive"
      })
    }
  }

  // Validate deployment token (you'll need to implement this)
  const validateDeploymentToken = async (
    provider: 'github' | 'vercel' | 'netlify' | 'supabase' | 'stripe',
    token: string
  ): Promise<boolean> => {
    // Implement token validation logic for each provider
    // This might involve making an API call to the respective provider
    switch (provider) {
      case 'github':
        // Example GitHub token validation
        try {
          const response = await fetch('https://api.github.com/user', {
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          })
          return response.ok
        } catch {
          return false
        }
      case 'vercel':
        // Example Vercel token validation
        try {
          const response = await fetch('https://api.vercel.com/v1/user', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          return response.ok
        } catch {
          return false
        }
      case 'netlify':
        // Example Netlify token validation
        try {
          const response = await fetch('https://api.netlify.com/api/v1/user', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          return response.ok
        } catch {
          return false
        }
      case 'supabase':
        // Supabase token validation using server-side API (avoids CORS issues)
        try {
          const validateResponse = await fetch('/api/supabase/validate-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          })

          const validateResult = await validateResponse.json()
          return validateResponse.ok && validateResult.valid
        } catch {
          return false
        }
      case 'stripe':
        // Stripe secret key validation
        try {
          const response = await fetch('https://api.stripe.com/v1/account', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
          return response.ok
        } catch {
          return false
        }
      default:
        return false
    }
  }


  const fetchCreditBalance = async (userId: string, isInitial: boolean = false) => {
    try {
      if (isInitial) setLoadingCredits(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wallet')
        .select('credits_balance, current_plan, credits_used_this_month')
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('Error fetching credit balance:', error)
        return
      }

      if (data) {
        setCreditBalance(data.credits_balance)
        setCurrentPlan(data.current_plan)
        setEstimatedMessages(Math.floor(data.credits_balance / 0.25))
      }
    } catch (error) {
      console.error('Exception fetching credit balance:', error)
    } finally {
      if (isInitial) setLoadingCredits(false)
    }
  }

  const handleTopUp = async (amount: number) => {
    // Payment provider selection is now handled by CreditTopUpSelector component
    // This function is kept for compatibility but delegates to the component
    setTopUpAmount(amount.toString())
    setShowTopUpDialog(true)
  }

  const handleDownloadAllInvoices = () => {
    // Download all user invoices
    // For now, just show an alert
    alert('Download all invoices feature is not yet implemented. Please check back later.')
  }

  const handleViewDetailedUsage = () => {
    // View detailed usage
    // For now, just show an alert
    alert('Detailed usage view is not yet implemented. Please check back later.')
  }


  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24">
          <div className="flex items-center justify-center min-h-screen">
            <RefreshCw className="h-8 w-8 animate-spin text-white" />
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />

      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      <div className="relative z-10 pt-16 pb-24 flex-grow">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col space-y-2 mb-6">
              <h1 className="text-3xl font-bold text-white">Account Settings</h1>
              <p className="text-gray-400">
                Manage your account information, security, and preferences
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Profile Information Card */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Profile Information
                  </CardTitle>
                  <CardDescription>
                    Your account details and contact information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {isEditingName ? (
                          <Input
                            id="name"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder="Enter your full name"
                            className="flex-1"
                            disabled={isUpdatingName}
                          />
                        ) : (
                          <Input
                            id="name"
                            value={user?.user_metadata?.full_name || "Not set"}
                            readOnly
                            className="bg-muted flex-1"
                          />
                        )}
                      </div>
                      <div className="flex gap-2">
                        {isEditingName ? (
                          <>
                            <Button
                              size="sm"
                              onClick={handleSaveName}
                              disabled={isUpdatingName || !editingName.trim()}
                            >
                              {isUpdatingName ? (
                                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Check className="h-4 w-4 mr-2" />
                              )}
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEditingName}
                              disabled={isUpdatingName}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleStartEditingName}
                          >
                            <Edit3 className="h-4 w-4 mr-2" />
                            Edit Name
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          value={user?.email || "Not set"}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Change Password Card (Security) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Security
                  </CardTitle>
                  <CardDescription>
                    Update your password and security settings
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleChangePassword}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full">
                      Update Password
                    </Button>
                  </CardFooter>
                </form>
              </Card>

              {/* Cloud Sync Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {cloudSyncEnabled ? (
                        <Cloud className="h-5 w-5 text-blue-500" />
                      ) : (
                        <CloudOff className="h-5 w-5 text-muted-foreground" />
                      )}
                      Cloud Sync
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Automatically backup your projects to the cloud</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>
                  <CardDescription>
                    Sync your projects across devices
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Auto Backup</p>
                      <p className="text-sm text-muted-foreground">
                        {cloudSyncEnabled
                          ? "Enabled - Backups created automatically"
                          : "Disabled - Enable to sync across devices"}
                      </p>
                    </div>
                    <Button
                      variant={cloudSyncEnabled ? "destructive" : "default"}
                      onClick={toggleCloudSync}
                    >
                      {cloudSyncEnabled ? "Disable" : "Enable"}
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Manual Backup</p>
                        {backupStatus === "syncing" && (
                          <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        {backupStatus === "success" && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {backupStatus === "error" && (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {lastBackup
                          ? `Last backup: ${new Date(lastBackup).toLocaleString()}`
                          : "No backups yet"}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={triggerManualBackup}
                          disabled={backupStatus === "syncing"}
                          className="flex-1"
                        >
                          {backupStatus === "syncing" ? "Backing up..." : "Create Backup"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleRestoreBackup}
                          disabled={backupStatus === "syncing"}
                          className="flex-1"
                        >
                          {backupStatus === "syncing" ? "Restoring..." : "Restore Backup"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>



              {/* Usage Statistics Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Usage Statistics
                  </CardTitle>
                  <CardDescription>
                    Your current usage and limits
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    

                    {/* Credits Section */}
                    <div className="space-y-2 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-800 dark:text-green-200">Credits</span>
                        </div>
                        {loadingCredits ? (
                          <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                        ) : (
                          <span className="text-sm font-bold text-green-700 dark:text-green-300">
                            {creditBalance !== null ? creditBalance.toFixed(2) : '0.00'}
                          </span>
                        )}
                      </div>

                      {!loadingCredits && creditBalance !== null && (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-green-700 dark:text-green-300">
                              ~{estimatedMessages} messages remaining
                            </span>
                            <span className="text-green-600 dark:text-green-400 capitalize">
                              {currentPlan} Plan
                            </span>
                          </div>

                          {/* Credit Status Indicator */}
                          <div className="flex items-center gap-2">
                            {creditBalance > 10 ? (
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <TrendingUp className="h-3 w-3" />
                                <span className="text-xs">Good balance</span>
                              </div>
                            ) : creditBalance > 2 ? (
                              <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                                <AlertTriangle className="h-3 w-3" />
                                <span className="text-xs">Low balance</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                <AlertTriangle className="h-3 w-3" />
                                <span className="text-xs">Very low</span>
                              </div>
                            )}
                          </div>

                          {/* Top Up Button */}
                          {(creditBalance <= 2 || currentPlan === 'free') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs mt-2 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950"
                              onClick={() => setShowTopUpDialog(true)}
                            >
                              <CreditCard className="h-3 w-3 mr-1" />
                              {currentPlan === 'free' ? 'Upgrade & Buy Credits' : 'Buy Credits'}
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Current Subscription Section */}
                    <div className="space-y-2 p-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Crown className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-800 dark:text-purple-200">Subscription</span>
                      </div>

                      {subscriptionLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="ml-2 text-xs">Loading subscription...</span>
                        </div>
                      ) : subscription ? (
                        <>
                          {/* Plan Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${subscription.status === 'active' ? 'bg-green-500' :
                                  subscription.status === 'trialing' ? 'bg-blue-500' :
                                    subscription.status === 'past_due' ? 'bg-yellow-500' : 'bg-red-500'
                                }`} />
                              <div>
                                <p className="text-sm font-medium capitalize">{subscription.plan} Plan</p>
                                <p className="text-xs text-muted-foreground">
                                  {subscription.status === 'active' ? 'Active' :
                                    subscription.status === 'trialing' ? 'Trial' :
                                      subscription.status === 'past_due' ? 'Payment Due' : 'Inactive'}
                                </p>
                              </div>
                            </div>
                            <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {subscription.status}
                            </Badge>
                          </div>

                          {/* Manage Billing Button */}
                          {subscription.plan !== 'free' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-8 text-xs mt-3 border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950"
                              onClick={handleManageBilling}
                              disabled={subscriptionLoading}
                            >
                              {subscriptionLoading ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                  Loading...
                                </>
                              ) : (
                                <>
                                  <Receipt className="h-3 w-3 mr-1.5" />
                                  Manage Billing
                                </>
                              )}
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-xs text-muted-foreground mb-2">No active subscription</p>
                          <Button asChild size="sm" variant="outline" className="w-full h-7 text-xs">
                            <a href="/pricing">Choose a Plan</a>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                 
                </CardContent>
              </Card>

             
              {/* Connected Services Card */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ExternalLink className="h-5 w-5" />
                    Connected Services
                  </CardTitle>
                  <CardDescription>
                    Manage your connections to external services for deployments
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* GitHub Connection */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-full">
                          <GitHubIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">GitHub</p>
                          <p className="text-sm text-muted-foreground">
                            {connections.github.connected
                              ? `Connected as ${connections.github.username}`
                              : "Connect your GitHub account for deployments"}
                          </p>
                        </div>
                      </div>
                      {connections.github.connected && connections.github.avatarUrl && (
                        <img
                          src={connections.github.avatarUrl}
                          alt="GitHub Avatar"
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Token Input - Always visible but disabled when connected */}
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={connections.github.connected ? "Token saved and secured" : "Enter your GitHub personal access token"}
                          value={connections.github.connected ? "••••••••••••••••••••••••••••••••" : connectionForms.github.token}
                          onChange={(e) => setConnectionForms(prev => ({
                            ...prev,
                            github: { ...prev.github, token: e.target.value, error: '' }
                          }))}
                          disabled={connections.github.connected}
                          className={connections.github.connected
                            ? "bg-green-50 border-green-200 cursor-not-allowed"
                            : connectionForms.github.error ? "border-red-500" : ""
                          }
                        />
                        {connections.github.connected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnect('github')}
                            disabled={connections.github.loading}
                          >
                            {connections.github.loading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Unlink className="h-4 w-4 mr-2" />
                            )}
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleConnect('github')}
                            disabled={connectionForms.github.isValidating || !connectionForms.github.token.trim()}
                          >
                            {connectionForms.github.isValidating ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              "Connect"
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Connection Status */}
                      {connections.github.connected && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600 font-medium">Connected and secured</span>
                        </div>
                      )}

                      {/* Error Message */}
                      {connectionForms.github.error && (
                        <p className="text-sm text-red-600">{connectionForms.github.error}</p>
                      )}

                      {/* Help Text */}
                      <p className="text-xs text-muted-foreground">
                        {connections.github.connected ? (
                          "Your token is securely stored. Click disconnect to change it."
                        ) : (
                          <>Need a token? <a href="https://github.com/settings/tokens/new?description=Pipilot%20(repo%20workflow)&scopes=repo,workflow,user,delete_repo" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Create one here</a></>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Vercel Connection */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-black rounded-full flex items-center justify-center">
                          <VercelIcon className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">Vercel</p>
                          <p className="text-sm text-muted-foreground">
                            {connections.vercel.connected
                              ? `Connected as ${connections.vercel.username}`
                              : "Connect your Vercel account for deployments"}
                          </p>
                        </div>
                      </div>
                      {connections.vercel.connected && connections.vercel.avatarUrl && (
                        <img
                          src={connections.vercel.avatarUrl}
                          alt="Vercel Avatar"
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Token Input - Always visible but disabled when connected */}
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={connections.vercel.connected ? "Token saved and secured" : "Enter your Vercel personal access token"}
                          value={connections.vercel.connected ? "••••••••••••••••••••••••••••••••" : connectionForms.vercel.token}
                          onChange={(e) => setConnectionForms(prev => ({
                            ...prev,
                            vercel: { ...prev.vercel, token: e.target.value, error: '' }
                          }))}
                          disabled={connections.vercel.connected}
                          className={connections.vercel.connected
                            ? "bg-green-50 border-green-200 cursor-not-allowed"
                            : connectionForms.vercel.error ? "border-red-500" : ""
                          }
                        />
                        {connections.vercel.connected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnect('vercel')}
                            disabled={connections.vercel.loading}
                          >
                            {connections.vercel.loading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Unlink className="h-4 w-4 mr-2" />
                            )}
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleConnect('vercel')}
                            disabled={connectionForms.vercel.isValidating || !connectionForms.vercel.token.trim()}
                          >
                            {connectionForms.vercel.isValidating ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              "Connect"
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Connection Status */}
                      {connections.vercel.connected && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600 font-medium">Connected and secured</span>
                        </div>
                      )}

                      {/* Error Message */}
                      {connectionForms.vercel.error && (
                        <p className="text-sm text-red-600">{connectionForms.vercel.error}</p>
                      )}

                      {/* Help Text */}
                      <p className="text-xs text-muted-foreground">
                        {connections.vercel.connected ? (
                          "Your token is securely stored. Click disconnect to change it."
                        ) : (
                          <>Need a token? <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Create one here</a></>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Netlify Connection */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-500 rounded-full flex items-center justify-center">
                          <NetlifyIcon className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">Netlify</p>
                          <p className="text-sm text-muted-foreground">
                            {connections.netlify.connected
                              ? `Connected as ${connections.netlify.username}`
                              : "Connect your Netlify account for deployments"}
                          </p>
                        </div>
                      </div>
                      {connections.netlify.connected && connections.netlify.avatarUrl && (
                        <img
                          src={connections.netlify.avatarUrl}
                          alt="Netlify Avatar"
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Token Input - Always visible but disabled when connected */}
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={connections.netlify.connected ? "Token saved and secured" : "Enter your Netlify personal access token"}
                          value={connections.netlify.connected ? "••••••••••••••••••••••••••••••••" : connectionForms.netlify.token}
                          onChange={(e) => setConnectionForms(prev => ({
                            ...prev,
                            netlify: { ...prev.netlify, token: e.target.value, error: '' }
                          }))}
                          disabled={connections.netlify.connected}
                          className={connections.netlify.connected
                            ? "bg-green-50 border-green-200 cursor-not-allowed"
                            : connectionForms.netlify.error ? "border-red-500" : ""
                          }
                        />
                        {connections.netlify.connected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnect('netlify')}
                            disabled={connections.netlify.loading}
                          >
                            {connections.netlify.loading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Unlink className="h-4 w-4 mr-2" />
                            )}
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleConnect('netlify')}
                            disabled={connectionForms.netlify.isValidating || !connectionForms.netlify.token.trim()}
                          >
                            {connectionForms.netlify.isValidating ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              "Connect"
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Connection Status */}
                      {connections.netlify.connected && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600 font-medium">Connected and secured</span>
                        </div>
                      )}

                      {/* Error Message */}
                      {connectionForms.netlify.error && (
                        <p className="text-sm text-red-600">{connectionForms.netlify.error}</p>
                      )}

                      {/* Help Text */}
                      <p className="text-xs text-muted-foreground">
                        {connections.netlify.connected ? (
                          "Your token is securely stored. Click disconnect to change it."
                        ) : (
                          <>Need a token? <a href="https://app.netlify.com/user/applications#personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Create one here</a></>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Supabase Connection */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500 rounded-full flex items-center justify-center">
                          <SupabaseIcon className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">Supabase</p>
                          <p className="text-sm text-muted-foreground">
                            {connections.supabase.connected
                              ? `${connections.supabase.projects?.length || 0} projects available`
                              : "Connect your Supabase account for database operations"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Token Input - Always visible but disabled when connected */}
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={connections.supabase.connected ? "Token saved and secured" : "Enter Supabase Management API token (not anon/service_role key)"}
                          value={connections.supabase.connected ? "••••••••••••••••••••••••••••••••" : connectionForms.supabase.token}
                          onChange={(e) => setConnectionForms(prev => ({
                            ...prev,
                            supabase: { ...prev.supabase, token: e.target.value, error: '' }
                          }))}
                          disabled={connections.supabase.connected}
                          className={connections.supabase.connected
                            ? "bg-green-50 border-green-200 cursor-not-allowed"
                            : connectionForms.supabase.error ? "border-red-500" : ""
                          }
                        />
                        {connections.supabase.connected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnect('supabase')}
                            disabled={connections.supabase.loading}
                          >
                            {connections.supabase.loading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Unlink className="h-4 w-4 mr-2" />
                            )}
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleConnect('supabase')}
                            disabled={connectionForms.supabase.isValidating || !connectionForms.supabase.token.trim()}
                          >
                            {connectionForms.supabase.isValidating ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              "Connect"
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Connection Status */}
                      {connections.supabase.connected && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600 font-medium">Connected and secured</span>
                        </div>
                      )}

                      {/* Project Selection - Only show when connected */}
                      {connections.supabase.connected && connections.supabase.projects && connections.supabase.projects.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Select Project</Label>
                          <select
                            className="w-full p-2 border rounded-md text-sm bg-black text-white"
                            value={connections.supabase.selectedProject?.id || ''}
                            onChange={async (e) => {
                              const selectedProject = connections.supabase.projects?.find(p => p.id === e.target.value)
                              if (selectedProject && user?.id) {
                                try {
                                  // Get the access token
                                  const tokens = await getDeploymentTokens(user.id)
                                  const accessToken = tokens?.supabase

                                  if (accessToken) {
                                    // Use server-side API to fetch project details and API keys (avoids CORS issues)
                                    try {
                                      // Fetch API keys automatically using server-side API
                                      const apiResponse = await fetch('/api/supabase/fetch-api-keys', {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                          token: accessToken,
                                          projectId: selectedProject.id
                                        }),
                                      })

                                      const apiResult = await apiResponse.json()

                                      if (apiResponse.ok && apiResult.success) {
                                        // Store project details with automatically fetched keys
                                        await storeSupabaseProjectDetails(user.id, {
                                          selectedProjectId: selectedProject.id,
                                          selectedProjectName: selectedProject.name,
                                          projectUrl: apiResult.projectUrl,
                                          anonKey: apiResult.anonKey,
                                          serviceRoleKey: apiResult.serviceRoleKey
                                        })

                                        toast({
                                          title: "Project Selected",
                                          description: `Selected ${selectedProject.name}. API keys fetched automatically.`,
                                        })
                                      } else {
                                        throw new Error(apiResult.error || 'Could not fetch API keys')
                                      }
                                    } catch (apiError) {
                                      console.error("Error fetching API keys from API:", apiError)
                                      // Fallback: store basic project info only
                                      await storeSupabaseProjectDetails(user.id, {
                                        selectedProjectId: selectedProject.id,
                                        selectedProjectName: selectedProject.name
                                      })

                                      toast({
                                        title: "Project Selected",
                                        description: `Selected ${selectedProject.name}. API keys could not be fetched automatically.`,
                                        variant: "destructive"
                                      })
                                    }
                                  }
                                } catch (error: any) {
                                  console.error("Error selecting project:", error)
                                  toast({
                                    title: "Error",
                                    description: "Failed to select project. Please try again.",
                                    variant: "destructive"
                                  })
                                }
                              }

                              setConnections(prev => ({
                                ...prev,
                                supabase: { ...prev.supabase, selectedProject }
                              }))
                            }}
                          >
                            <option value="">Select a project...</option>
                            {connections.supabase.projects.map((project: any) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                          {connections.supabase.selectedProject && (
                            <p className="text-xs text-muted-foreground">
                              Selected: {connections.supabase.selectedProject.name}
                              {(() => {
                                // Check if API keys are available
                                const checkKeys = async () => {
                                  try {
                                    const details = await getSupabaseProjectDetails(user?.id || '')
                                    return details?.anonKey && details?.serviceRoleKey
                                  } catch {
                                    return false
                                  }
                                }
                                // This will be checked asynchronously
                                return null
                              })()}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Create New Project Button */}
                      {connections.supabase.connected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateSupabaseProject()}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create New Project
                        </Button>
                      )}

                      {/* Error Message */}
                      {connectionForms.supabase.error && (
                        <p className="text-sm text-red-600">{connectionForms.supabase.error}</p>
                      )}

                      {/* Help Text */}
                      <p className="text-xs text-muted-foreground">
                        {connections.supabase.connected ? (
                          "Your token is securely stored. API keys are fetched automatically when selecting a project."
                        ) : (
                          <>
                            Enter your Supabase Management API token from{" "}
                            <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              supabase.com/dashboard/account/tokens
                            </a>{" "}
                            or use{" "}
                            <a href="https://api.optimaai.cc/supabase-auth/login" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              OAuth login
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Stripe Connection */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500 rounded-full flex items-center justify-center">
                          <StripeIcon className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">Stripe</p>
                          <p className="text-sm text-muted-foreground">
                            {connections.stripe.connected
                              ? "Connected for payment processing"
                              : "Connect your Stripe account for payment operations"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Token Input - Always visible but disabled when connected */}
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={connections.stripe.connected ? "Secret key saved and secured" : "Enter Stripe Secret Key (sk_live_... or sk_test_...)"}
                          value={connections.stripe.connected ? "••••••••••••••••••••••••••••••••" : connectionForms.stripe.token}
                          onChange={(e) => setConnectionForms(prev => ({
                            ...prev,
                            stripe: { ...prev.stripe, token: e.target.value, error: '' }
                          }))}
                          disabled={connections.stripe.connected}
                          className={connections.stripe.connected
                            ? "bg-purple-50 border-purple-200 cursor-not-allowed"
                            : connectionForms.stripe.error ? "border-red-500" : ""
                          }
                        />
                        {connections.stripe.connected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnect('stripe')}
                            disabled={connections.stripe.loading}
                          >
                            {connections.stripe.loading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Unlink className="h-4 w-4 mr-2" />
                            )}
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleConnect('stripe')}
                            disabled={connectionForms.stripe.isValidating || !connectionForms.stripe.token.trim()}
                          >
                            {connectionForms.stripe.isValidating ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              "Connect"
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Connection Status */}
                      {connections.stripe.connected && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600 font-medium">Connected and secured</span>
                        </div>
                      )}

                      {/* Error Message */}
                      {connectionForms.stripe.error && (
                        <p className="text-sm text-red-600">{connectionForms.stripe.error}</p>
                      )}

                      {/* Help Text */}
                      <p className="text-xs text-muted-foreground">
                        {connections.stripe.connected ? (
                          "Your Stripe secret key is securely stored and encrypted."
                        ) : (
                          <>
                            Enter your Stripe Secret Key from{" "}
                            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              dashboard.stripe.com/apikeys
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Tool Preferences Card */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    AI Tool Preferences
                  </CardTitle>
                  <CardDescription>
                    Enable or disable tool categories to control what your AI assistant can do. Disabling unused categories reduces token usage and prevents context overflow errors.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { id: 'file_ops', name: 'File Operations', desc: 'Read, write, edit, delete files', icon: FileText, tools: 'write_file, read_file, edit_file, delete_file, delete_folder' },
                      { id: 'code_search', name: 'Code Search & Analysis', desc: 'Grep search, semantic navigator, list files', icon: Search, tools: 'grep_search, semantic_code_navigator, list_files' },
                      { id: 'web_tools', name: 'Web Search & Extract', desc: 'Search the web, extract page content', icon: Globe, tools: 'web_search, web_extract' },
                      { id: 'dev_tools', name: 'Dev Server & Sandbox', desc: 'Check errors, run Node.js commands', icon: Terminal, tools: 'check_dev_errors, node_machine' },
                      { id: 'pipilot_db', name: 'PiPilot Database', desc: 'Create/query/manage PiPilot DB tables', icon: Database, tools: 'pipilotdb_create_database, pipilotdb_query_database, pipilotdb_create_table, etc.' },
                      { id: 'supabase', name: 'Supabase Integration', desc: 'Remote Supabase table operations', icon: Server, tools: 'supabase_create_table, supabase_execute_sql, etc.' },
                      { id: 'stripe', name: 'Stripe Payments', desc: 'Products, prices, customers, payments', icon: CreditCard, tools: 'stripe_list_products, stripe_create_product, etc.' },
                      { id: 'docs_quality', name: 'Documentation & Reports', desc: 'Generate docs, code review, quality analysis', icon: Code, tools: 'auto_documentation, code_review, code_quality_analysis' },
                      { id: 'image_gen', name: 'Image Generation', desc: 'Generate AI images from text prompts', icon: Palette, tools: 'generate_image' },
                    ].map((category) => {
                      const isDisabled = disabledToolCategories.includes(category.id)
                      return (
                        <div
                          key={category.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                            isDisabled ? 'border-gray-800 bg-gray-900/30 opacity-60' : 'border-gray-700 bg-gray-900/50'
                          }`}
                        >
                          <category.icon className={`h-4 w-4 mt-0.5 shrink-0 ${isDisabled ? 'text-gray-600' : 'text-indigo-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm font-medium ${isDisabled ? 'text-gray-500' : 'text-white'}`}>{category.name}</span>
                              <Switch
                                checked={!isDisabled}
                                onCheckedChange={() => toggleToolCategory(category.id)}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{category.desc}</p>
                            <p className="text-[10px] text-gray-600 mt-1 font-mono truncate">{category.tools}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {disabledToolCategories.length > 0 && (
                    <div className="flex items-center gap-2 mt-4 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-400/80">
                        {disabledToolCategories.length} category{disabledToolCategories.length !== 1 ? 'ies' : 'y'} disabled. The AI will not have access to these tools during chat.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Delete Account Card */}
              <Card className="md:col-span-2 border-destructive">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <Trash2 className="h-5 w-5" />
                    Delete Account
                  </CardTitle>
                  <CardDescription>
                    Permanently remove your account and all associated data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="deleteConfirmation">
                      Type "DELETE MY ACCOUNT" to confirm
                    </Label>
                    <Input
                      id="deleteConfirmation"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="DELETE MY ACCOUNT"
                    />
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        disabled={deleteConfirmation !== "DELETE MY ACCOUNT"}
                        className="w-full"
                      >
                        Delete Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          disabled={isDeleting}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          {isDeleting ? "Deleting..." : "Yes, delete my account"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      {/* Footer */}
      <Footer />

      {/* Credit Top-Up Dialog */}
      <Dialog open={showTopUpDialog} onOpenChange={setShowTopUpDialog}>
        <DialogContent className="bg-gray-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Buy Credits</DialogTitle>
            <DialogDescription className="text-gray-400">
              {currentPlan === 'free'
                ? 'Upgrade to a paid plan to purchase credits.'
                : `Purchase additional credits for your ${currentPlan} plan.`
              }
            </DialogDescription>
          </DialogHeader>
          {currentPlan === 'free' ? (
            <div className="py-4">
              <p className="text-gray-400 text-center mb-4">
                Credit purchases are only available for paid plans.
              </p>
              <Button
                onClick={() => window.location.href = '/pricing'}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
              >
                View Plans
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-white">Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="bg-gray-800/50 border-white/10 text-white pl-7"
                    placeholder="10.00"
                  />
                </div>
                <p className="text-xs text-gray-400">Minimum: $1.00, Maximum: $1,000.00 (1 credit = $1)</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map(amount => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() => setTopUpAmount(amount.toString())}
                    className="border-white/10 text-white hover:bg-white/5"
                  >
                    ${amount}
                  </Button>
                ))}
              </div>
              {parseFloat(topUpAmount) > 0 && (
                <div className="mt-4">
                  <CreditTopUpSelector
                    credits={parseFloat(topUpAmount)}
                    onClose={() => setShowTopUpDialog(false)}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="sr-only">
            <Button
              onClick={() => setShowTopUpDialog(false)}
              variant="outline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Wrapper component with Suspense boundary for useSearchParams
export default function AccountSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading account settings...</p>
        </div>
      </div>
    }>
      <AccountSettingsPageContent />
    </Suspense>
  )
}