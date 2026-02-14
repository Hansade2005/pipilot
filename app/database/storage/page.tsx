"use client"

import { useEffect, useState } from "react"
import { Database, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import StorageManager from '@/components/database/storage-manager'
import { toast } from "sonner"
import { usePageTitle } from '@/hooks/use-page-title'

export default function StoragePage() {
  usePageTitle('Database Storage')
    const [database, setDatabase] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadDatabase()
    }, [])

    async function loadDatabase() {
        try {
            setLoading(true)
            const dbId = localStorage.getItem('user_database_id')

            if (!dbId) {
                toast.error('No database selected')
                return
            }

            const response = await fetch(`/api/database/${dbId}`)
            const data = await response.json()

            if (data.success) {
                setDatabase(data.database)
            }
        } catch (error) {
            console.error('Error loading database:', error)
            toast.error('Failed to load database')
        } finally {
            setLoading(false)
        }
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
        <div className="h-full p-8">
            <StorageManager databaseId={database.id.toString()} />
        </div>
    )
}
