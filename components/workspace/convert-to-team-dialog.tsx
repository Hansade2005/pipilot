"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Users, Plus, Sparkles, ArrowRight, CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Organization {
  id: string
  name: string
  slug: string
  member_count?: number
}

interface ConvertToTeamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceName: string
  onConversionComplete?: () => void
}

export function ConvertToTeamDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  onConversionComplete
}: ConvertToTeamDialogProps) {
  const [step, setStep] = useState<'select' | 'create' | 'converting' | 'success'>("select")
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [newOrgName, setNewOrgName] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      fetchOrganizations()
      setStep("select")
    }
  }, [open])

  const fetchOrganizations = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) return

      // Fetch user's organizations
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          organization_id,
          role,
          organizations:organization_id (
            id,
            name,
            slug
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('role', ['owner', 'admin'])

      if (error) {
        console.error('[ConvertToTeam] Error fetching orgs:', error)
        return
      }

      const orgs = (data || [])
        .filter((item: any) => item.organizations)
        .map((item: any) => item.organizations as unknown as Organization)

      setOrganizations(orgs)
    } catch (error) {
      console.error('[ConvertToTeam] Error:', error)
    }
  }

  const handleCreateNewOrg = async () => {
    if (!newOrgName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter an organization name",
        variant: "destructive"
      })
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      const slug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: newOrgName.trim(),
          slug,
          owner_id: user.id
        })
        .select()
        .single()

      if (orgError) throw orgError

      // Add user as owner
      const { error: memberError } = await supabase
        .from('team_members')
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: 'owner',
          status: 'active'
        })

      if (memberError) throw memberError

      setSelectedOrgId(org.id)
      setStep("converting")
      await performConversion(org.id)
    } catch (error: any) {
      console.error('[ConvertToTeam] Error creating org:', error)
      toast({
        title: "Failed to create organization",
        description: error.message,
        variant: "destructive"
      })
      setLoading(false)
    }
  }

  const handleConvert = async () => {
    if (!selectedOrgId) {
      toast({
        title: "Organization required",
        description: "Please select an organization",
        variant: "destructive"
      })
      return
    }

    setStep("converting")
    await performConversion(selectedOrgId)
  }

  const performConversion = async (orgId: string) => {
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      // 1. Create team workspace in Supabase
      const { data: teamWorkspace, error: workspaceError } = await supabase
        .from('team_workspaces')
        .insert({
          organization_id: orgId,
          name: workspaceName,
          created_by: user.id,
          visibility: 'team',
          files: []
        })
        .select()
        .single()

      if (workspaceError) throw workspaceError

      // 2. Copy files from IndexedDB to team workspace
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      const files = await storageManager.getFiles(workspaceId)

      // Create files in team workspace via API
      for (const file of files) {
        const response = await fetch(`/api/teams/workspaces/${teamWorkspace.id}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            path: file.path,
            content: file.content,
            fileType: file.fileType,
            type: file.type,
            size: file.size,
            isDirectory: file.isDirectory
          })
        })

        if (!response.ok) {
          console.error(`Failed to copy file: ${file.path}`)
        }
      }

      // 3. Update the original workspace to link to team workspace
      await storageManager.updateWorkspace(workspaceId, {
        organizationId: orgId,
        isTeamWorkspace: true,
        teamWorkspaceId: teamWorkspace.id
      })

      setStep("success")

      toast({
        title: "Conversion successful!",
        description: `${workspaceName} is now a team workspace`,
      })

      // Wait a bit to show success state
      setTimeout(() => {
        setLoading(false)
        onOpenChange(false)
        if (onConversionComplete) {
          onConversionComplete()
        }
      }, 2000)
    } catch (error: any) {
      console.error('[ConvertToTeam] Conversion error:', error)
      toast({
        title: "Conversion failed",
        description: error.message,
        variant: "destructive"
      })
      setLoading(false)
      setStep("select")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-gray-900 border-gray-800 text-white">
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-orange-400" />
                <span className="text-gray-100">Convert to Team Workspace</span>
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Make "{workspaceName}" a collaborative team workspace. All files will be synced to Supabase for real-time collaboration.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {organizations.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-gray-300">Select Organization</Label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Choose an organization..." />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id} className="text-gray-200">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-orange-400" />
                            {org.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-gray-900 px-2 text-gray-500">
                    Or
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full border-gray-700 text-gray-300 hover:bg-gray-800"
                onClick={() => setStep("create")}
              >
                <Plus className="h-4 w-4 mr-2 text-orange-400" />
                Create New Organization
              </Button>

              <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-300">Team Features:</p>
                    <ul className="text-orange-300 text-xs space-y-1 mt-1 ml-4 list-disc">
                      <li>Real-time collaboration</li>
                      <li>Team member access</li>
                      <li>Activity tracking</li>
                      <li>Cloud sync (no offline mode)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="bg-orange-600 hover:bg-orange-500 text-white" onClick={handleConvert} disabled={!selectedOrgId || loading}>
                {loading ? "Converting..." : "Convert to Team"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "create" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-orange-400" />
                <span className="text-gray-100">Create Organization</span>
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Create a new organization to manage your team workspaces.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="org-name" className="text-gray-300">Organization Name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g., Acme Inc"
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button className="bg-orange-600 hover:bg-orange-500 text-white" onClick={handleCreateNewOrg} disabled={!newOrgName.trim() || loading}>
                {loading ? "Creating..." : "Create & Convert"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "converting" && (
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold mb-2 text-gray-100">Converting to Team Workspace</h3>
            <p className="text-sm text-gray-400">
              Copying files and setting up collaboration...
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-gray-100">Conversion Complete!</h3>
            <p className="text-sm text-gray-400">
              Your workspace is now ready for team collaboration.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
