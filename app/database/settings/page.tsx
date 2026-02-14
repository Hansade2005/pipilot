"use client"

import { useEffect, useState } from "react"
import { Database, Key, Copy, Trash2, Plus, Loader2, AlertTriangle, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { usePageTitle } from '@/hooks/use-page-title'

interface ApiKey {
    id: string
    name: string
    key_prefix: string
    created_at: string
    last_used_at: string | null
    rate_limit: number
    is_active: boolean
    usage?: {
        last_hour: number
        total: number
    }
}

export default function SettingsPage() {
  usePageTitle('Database Settings')
    const [database, setDatabase] = useState<any>(null)
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [showDeleteDbDialog, setShowDeleteDbDialog] = useState(false)
    const [deleteConfirmName, setDeleteConfirmName] = useState("")
    const [deletingDatabase, setDeletingDatabase] = useState(false)
    const [newKeyName, setNewKeyName] = useState("")
    const [newKeyValue, setNewKeyValue] = useState("")
    const [deletingKey, setDeletingKey] = useState<ApiKey | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            const dbId = localStorage.getItem('user_database_id')

            if (!dbId) {
                toast.error('No database selected')
                return
            }

            // Load database info
            const dbResponse = await fetch(`/api/database/${dbId}`)
            const dbData = await dbResponse.json()

            if (dbData.success) {
                setDatabase(dbData.database)
            }

            // Load API keys
            const keysResponse = await fetch(`/api/database/${dbId}/api-keys`)
            if (keysResponse.ok) {
                const keysData = await keysResponse.json()
                setApiKeys(keysData.api_keys || [])
            }
        } catch (error) {
            console.error('Error loading data:', error)
            toast.error('Failed to load settings')
        } finally {
            setLoading(false)
        }
    }

    async function createApiKey() {
        if (!newKeyName.trim()) {
            toast.error('Please enter a key name')
            return
        }

        try {
            setCreating(true)
            const response = await fetch(`/api/database/${database.id}/api-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName.trim() })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create API key')
            }

            setNewKeyValue(data.api_key.key)
            toast.success('API key created successfully!')
            await loadData()
            setNewKeyName("")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create API key')
        } finally {
            setCreating(false)
        }
    }

    async function deleteApiKey(keyId: string) {
        try {
            const response = await fetch(`/api/database/${database.id}/api-keys/${keyId}`, {
                method: 'DELETE'
            })

            if (!response.ok) {
                throw new Error('Failed to delete API key')
            }

            toast.success('API key deleted')
            await loadData()
            setShowDeleteDialog(false)
            setDeletingKey(null)
        } catch (error) {
            toast.error('Failed to delete API key')
        }
    }

    async function deleteDatabase() {
        if (deleteConfirmName !== database.name) {
            toast.error('Database name does not match')
            return
        }

        try {
            setDeletingDatabase(true)
            const response = await fetch(`/api/database/${database.id}`, {
                method: 'DELETE'
            })

            if (!response.ok) {
                throw new Error('Failed to delete database')
            }

            toast.success('Database deleted successfully')

            // Clear localStorage and redirect
            localStorage.removeItem('user_database_id')
            window.location.href = '/database'
        } catch (error) {
            toast.error('Failed to delete database')
            setDeletingDatabase(false)
        }
    }

    function copyToClipboard(text: string, label: string) {
        navigator.clipboard.writeText(text)
        toast.success(`${label} copied to clipboard`)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
        )
    }

    if (!database) {
        return (
            <div className="flex items-center justify-center h-full p-8">
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5 max-w-md">
                    <CardContent className="pt-6 text-center">
                        <Database className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-xl font-semibold text-white mb-2">No Database Selected</h3>
                        <p className="text-gray-400">Please create or select a database to continue</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="h-full p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                    <p className="text-gray-400">Manage your database configuration and API keys</p>
                </div>

                {/* Database Information */}
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Database className="h-5 w-5 text-purple-400" />
                            Database Information
                        </CardTitle>
                        <CardDescription className="text-gray-400">
                            Basic information about your database
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4">
                            <div>
                                <Label className="text-sm text-gray-400">Database Name</Label>
                                <div className="mt-1.5 px-3 py-2 bg-gray-800/50 border border-white/10 rounded-lg text-white font-medium">
                                    {database.name}
                                </div>
                            </div>

                            <div>
                                <Label className="text-sm text-gray-400">Database ID</Label>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <div className="flex-1 px-3 py-2 bg-gray-800/50 border border-white/10 rounded-lg text-white font-mono text-sm">
                                        {database.id}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(database.id.toString(), 'Database ID')}
                                        className="border-white/10 text-white hover:bg-white/5"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label className="text-sm text-gray-400">Project ID</Label>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <div className="flex-1 px-3 py-2 bg-gray-800/50 border border-white/10 rounded-lg text-white font-mono text-sm">
                                        {database.project_id}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(database.project_id, 'Project ID')}
                                        className="border-white/10 text-white hover:bg-white/5"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label className="text-sm text-gray-400">Created</Label>
                                <div className="mt-1.5 px-3 py-2 bg-gray-800/50 border border-white/10 rounded-lg text-white">
                                    {new Date(database.created_at).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* API Keys Management */}
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Key className="h-5 w-5 text-purple-400" />
                                    API Keys
                                </CardTitle>
                                <CardDescription className="text-gray-400 mt-1">
                                    Manage API keys for accessing your database
                                </CardDescription>
                            </div>
                            <Button
                                onClick={() => setShowCreateDialog(true)}
                                disabled={apiKeys.length >= 10}
                                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                New Key
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {apiKeys.length === 0 ? (
                            <div className="text-center py-12">
                                <Key className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                                <h3 className="text-lg font-semibold text-white mb-2">No API Keys</h3>
                                <p className="text-gray-400 mb-4">Create your first API key to start using the API</p>
                                <Button
                                    onClick={() => setShowCreateDialog(true)}
                                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create API Key
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {apiKeys.map((key) => (
                                    <div
                                        key={key.id}
                                        className="p-4 bg-gray-800/50 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h4 className="text-white font-medium">{key.name}</h4>
                                                    <Badge
                                                        className={
                                                            key.is_active
                                                                ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                : "bg-gray-500/10 text-gray-300 border-gray-500/20"
                                                        }
                                                    >
                                                        {key.is_active ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                </div>
                                                <div className="space-y-1 text-sm">
                                                    <div className="flex items-center gap-2 text-gray-400">
                                                        <span className="font-mono">{key.key_prefix}...</span>
                                                        <span>•</span>
                                                        <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    {key.usage && (
                                                        <div className="flex items-center gap-4 text-gray-400">
                                                            <span>Last hour: {key.usage.last_hour.toLocaleString()} requests</span>
                                                            <span>Total: {key.usage.total.toLocaleString()} requests</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setDeletingKey(key)
                                                    setShowDeleteDialog(true)
                                                }}
                                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                                    <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-gray-400">
                                        You can create up to 10 API keys per database. Each key has a rate limit of 10,000 requests per hour.
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-400" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription className="text-gray-400">
                            Irreversible and destructive actions
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 bg-gray-900/50 border border-white/5 rounded-lg">
                            <div>
                                <h4 className="text-white font-medium mb-1">Delete Database</h4>
                                <p className="text-sm text-gray-400">
                                    Permanently delete this database and all of its data. This action cannot be undone.
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                onClick={() => setShowDeleteDbDialog(true)}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                Delete Database
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Create API Key Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="bg-gray-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Create API Key</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {newKeyValue ? 'Save this key - it will only be shown once!' : 'Create a new API key for your database'}
                        </DialogDescription>
                    </DialogHeader>

                    {newKeyValue ? (
                        <div className="space-y-4">
                            <div>
                                <Label className="text-white">Your new API key</Label>
                                <div className="mt-2 flex items-center gap-2">
                                    <Input
                                        value={newKeyValue}
                                        readOnly
                                        className="bg-gray-800/50 border-white/10 text-white font-mono"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => copyToClipboard(newKeyValue, 'API key')}
                                        className="border-white/10 text-white hover:bg-white/5"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                <p className="text-sm text-yellow-300">
                                    ⚠️ Make sure to copy your API key now. You won't be able to see it again!
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="keyName" className="text-white">Key Name</Label>
                                <Input
                                    id="keyName"
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    placeholder="e.g., Production App, Development"
                                    className="mt-2 bg-gray-800/50 border-white/10 text-white placeholder:text-gray-500"
                                    disabled={creating}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {newKeyValue ? (
                            <Button
                                onClick={() => {
                                    setNewKeyValue("")
                                    setShowCreateDialog(false)
                                }}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                            >
                                Done
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowCreateDialog(false)}
                                    disabled={creating}
                                    className="border-white/10 text-white hover:bg-white/5"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={createApiKey}
                                    disabled={creating || !newKeyName.trim()}
                                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                                >
                                    {creating ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Create Key
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent className="bg-gray-900 border-white/10">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Delete API Key?</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-400">
                            Are you sure you want to delete the API key "{deletingKey?.name}"? Applications using this key will no longer be able to access your database.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 text-white hover:bg-white/5">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingKey && deleteApiKey(deletingKey.id)}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Delete Key
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Database Confirmation Dialog */}
            <AlertDialog open={showDeleteDbDialog} onOpenChange={setShowDeleteDbDialog}>
                <AlertDialogContent className="bg-gray-900 border-white/10">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-400" />
                            Delete Database?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-400 space-y-3">
                            <p>
                                This will permanently delete the database <span className="font-semibold text-white">{database.name}</span> and all of its data including:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                <li>All tables and records</li>
                                <li>All API keys</li>
                                <li>All storage files</li>
                                <li>All configuration</li>
                            </ul>
                            <p className="text-red-400 font-medium">
                                This action cannot be undone!
                            </p>
                            <div className="pt-2">
                                <Label className="text-white text-sm">Type <span className="font-mono bg-gray-800 px-1 rounded">{database.name}</span> to confirm:</Label>
                                <Input
                                    value={deleteConfirmName}
                                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                                    placeholder={database.name}
                                    className="mt-2 bg-gray-800/50 border-white/10 text-white placeholder:text-gray-500"
                                    disabled={deletingDatabase}
                                />
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="border-white/10 text-white hover:bg-white/5"
                            disabled={deletingDatabase}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={deleteDatabase}
                            disabled={deletingDatabase || deleteConfirmName !== database.name}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {deletingDatabase ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Delete Database'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
