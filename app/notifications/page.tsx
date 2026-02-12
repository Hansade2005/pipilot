"use client"

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Bell,
    Check,
    CheckCheck,
    ArrowLeft,
    Calendar,
    Info,
    AlertCircle,
    CheckCircle,
    AlertTriangle,
    Megaphone,
    Sparkles,
    Shield,
    Wrench
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSearchParams, useRouter } from 'next/navigation'
import { usePageTitle } from '@/hooks/use-page-title'

interface Notification {
    id: string
    title: string
    message: string
    body?: string
    type: string
    url?: string
    image_url?: string
    icon?: string
    priority: number
    is_read: boolean
    read_at?: string
    expires_at?: string
    created_at: string
}

function NotificationsPageContent() {
    const supabase = createClient()
    const searchParams = useSearchParams()
    const router = useRouter()
    const notificationId = searchParams?.get('id')

    const [notifications, setNotifications] = useState<Notification[]>([])
    const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')

    useEffect(() => {
        loadNotifications()
    }, [])

    useEffect(() => {
        if (notificationId && notifications.length > 0) {
            const notification = notifications.find(n => n.id === notificationId)
            if (notification) {
                handleSelectNotification(notification)
            }
        }
    }, [notificationId, notifications])

    async function loadNotifications() {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            
            if (!user) {
                toast.error('Please sign in to view notifications')
                return
            }

            const { data, error } = await supabase
                .from('user_notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error

            setNotifications(data || [])
        } catch (error) {
            console.error('Error loading notifications:', error)
            toast.error('Failed to load notifications')
        } finally {
            setLoading(false)
        }
    }

    async function markAsRead(notificationId: string) {
        try {
            const { error } = await supabase
                .from('user_notifications')
                .update({
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('id', notificationId)

            if (error) throw error

            setNotifications(prev =>
                prev.map(n =>
                    n.id === notificationId
                        ? { ...n, is_read: true, read_at: new Date().toISOString() }
                        : n
                )
            )

            if (selectedNotification?.id === notificationId) {
                setSelectedNotification(prev => prev ? { ...prev, is_read: true, read_at: new Date().toISOString() } : null)
            }

            toast.success('Marked as read')
        } catch (error) {
            console.error('Error marking as read:', error)
            toast.error('Failed to mark as read')
        }
    }

    async function markAllAsRead() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { error } = await supabase
                .from('user_notifications')
                .update({
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .eq('is_read', false)

            if (error) throw error

            setNotifications(prev =>
                prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
            )

            toast.success('All notifications marked as read')
        } catch (error) {
            console.error('Error marking all as read:', error)
            toast.error('Failed to mark all as read')
        }
    }

    async function deleteNotification(notificationId: string) {
        try {
            const { error } = await supabase
                .from('user_notifications')
                .delete()
                .eq('id', notificationId)

            if (error) throw error

            setNotifications(prev => prev.filter(n => n.id !== notificationId))
            
            if (selectedNotification?.id === notificationId) {
                setSelectedNotification(null)
            }

            toast.success('Notification deleted')
        } catch (error) {
            console.error('Error deleting notification:', error)
            toast.error('Failed to delete notification')
        }
    }

    function handleSelectNotification(notification: Notification) {
        setSelectedNotification(notification)
        
        // Mark as read when opening
        if (!notification.is_read) {
            markAsRead(notification.id)
        }

        // Update URL
        router.push(`/notifications?id=${notification.id}`, { scroll: false })
    }

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'info': return <Info className="h-5 w-5 text-blue-400" />
            case 'success': return <CheckCircle className="h-5 w-5 text-green-400" />
            case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-400" />
            case 'error': return <AlertCircle className="h-5 w-5 text-red-400" />
            case 'announcement': return <Megaphone className="h-5 w-5 text-purple-400" />
            case 'feature': return <Sparkles className="h-5 w-5 text-indigo-400" />
            case 'maintenance': return <Wrench className="h-5 w-5 text-orange-400" />
            case 'security': return <Shield className="h-5 w-5 text-red-400" />
            default: return <Bell className="h-5 w-5 text-gray-400" />
        }
    }

    const getTypeBadgeColor = (type: string) => {
        switch (type) {
            case 'info': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            case 'success': return 'bg-green-500/20 text-green-400 border-green-500/30'
            case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
            case 'error': return 'bg-red-500/20 text-red-400 border-red-500/30'
            case 'announcement': return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
            case 'feature': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
            case 'maintenance': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
            case 'security': return 'bg-red-500/20 text-red-400 border-red-500/30'
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
        }
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'unread') return !n.is_read
        if (filter === 'read') return n.is_read
        return true
    })

    const unreadCount = notifications.filter(n => !n.is_read).length

    return (
        <div className="min-h-screen bg-gray-950 p-4 lg:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-white">Notifications</h1>
                            <p className="text-gray-400 text-sm mt-1">
                                {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
                            </p>
                        </div>
                    </div>
                    {unreadCount > 0 && (
                        <Button onClick={markAllAsRead} className="bg-purple-600 hover:bg-purple-500">
                            <CheckCheck className="h-4 w-4 mr-2" />
                            Mark All Read
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Notifications List */}
                    <div className="lg:col-span-1">
                        <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                            <CardHeader className="pb-3">
                                <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                                    <TabsList className="bg-gray-800/50 w-full">
                                        <TabsTrigger value="all" className="flex-1">
                                            All ({notifications.length})
                                        </TabsTrigger>
                                        <TabsTrigger value="unread" className="flex-1">
                                            Unread ({unreadCount})
                                        </TabsTrigger>
                                        <TabsTrigger value="read" className="flex-1">
                                            Read ({notifications.length - unreadCount})
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="max-h-[calc(100vh-250px)] overflow-y-auto">
                                    {loading ? (
                                        <div className="py-8 text-center text-gray-400">
                                            Loading...
                                        </div>
                                    ) : filteredNotifications.length === 0 ? (
                                        <div className="py-8 text-center text-gray-400">
                                            <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                            <p>No notifications</p>
                                        </div>
                                    ) : (
                                        filteredNotifications.map(notification => (
                                            <button
                                                key={notification.id}
                                                onClick={() => handleSelectNotification(notification)}
                                                className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${
                                                    selectedNotification?.id === notification.id ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : ''
                                                } ${
                                                    !notification.is_read ? 'bg-blue-500/5' : ''
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="flex-shrink-0 mt-1">
                                                        {getTypeIcon(notification.type)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2 mb-1">
                                                            <h4 className={`font-medium text-sm ${!notification.is_read ? 'text-white' : 'text-gray-300'}`}>
                                                                {notification.title}
                                                            </h4>
                                                            {!notification.is_read && (
                                                                <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-400 line-clamp-2 mb-1">
                                                            {notification.message}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {formatDate(notification.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Notification Detail */}
                    <div className="lg:col-span-2">
                        {selectedNotification ? (
                            <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-4 mb-4">
                                        <div className="flex items-start gap-3 flex-1">
                                            <div className="p-2 bg-gray-800/50 rounded-lg">
                                                {getTypeIcon(selectedNotification.type)}
                                            </div>
                                            <div className="flex-1">
                                                <CardTitle className="text-white text-xl mb-2">
                                                    {selectedNotification.title}
                                                </CardTitle>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge variant="outline" className={getTypeBadgeColor(selectedNotification.type)}>
                                                        {selectedNotification.type}
                                                    </Badge>
                                                    <div className="flex items-center gap-1 text-sm text-gray-400">
                                                        <Calendar className="h-3 w-3" />
                                                        {formatDate(selectedNotification.created_at)}
                                                    </div>
                                                    {selectedNotification.is_read && (
                                                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                                                            <Check className="h-3 w-3 mr-1" />
                                                            Read
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            {!selectedNotification.is_read && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => markAsRead(selectedNotification.id)}
                                                    className="border-white/10 text-white hover:bg-white/5"
                                                >
                                                    <Check className="h-4 w-4 mr-2" />
                                                    Mark Read
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => deleteNotification(selectedNotification.id)}
                                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {selectedNotification.image_url && (
                                        <div className="rounded-lg overflow-hidden">
                                            <img
                                                src={selectedNotification.image_url}
                                                alt={selectedNotification.title}
                                                className="w-full h-auto"
                                            />
                                        </div>
                                    )}
                                    
                                    <div className="prose prose-invert max-w-none">
                                        <p className="text-gray-300 text-base leading-relaxed whitespace-pre-wrap">
                                            {selectedNotification.body || selectedNotification.message}
                                        </p>
                                    </div>

                                    {selectedNotification.url && (
                                        <div className="pt-4 border-t border-white/5">
                                            <Link href={selectedNotification.url}>
                                                <Button className="bg-purple-600 hover:bg-purple-500">
                                                    View Details
                                                </Button>
                                            </Link>
                                        </div>
                                    )}

                                    {selectedNotification.expires_at && (
                                        <div className="text-xs text-gray-500 flex items-center gap-2 pt-4 border-t border-white/5">
                                            <AlertCircle className="h-4 w-4" />
                                            Expires: {formatDate(selectedNotification.expires_at)}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                                <CardContent className="py-16 text-center">
                                    <Bell className="h-16 w-16 mx-auto mb-4 text-gray-600 opacity-50" />
                                    <h3 className="text-xl font-semibold text-white mb-2">No notification selected</h3>
                                    <p className="text-gray-400">
                                        Select a notification from the list to view its details
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function NotificationsPage() {
  usePageTitle('Notifications')
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        }>
            <NotificationsPageContent />
        </Suspense>
    )
}
