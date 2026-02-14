'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Bell, Eye, Send, Settings, Clock, Star } from 'lucide-react';
import { useOneSignal } from '@/hooks/use-onesignal';
import { toast } from 'sonner';
import { NOTIFICATION_TEMPLATES } from '@/lib/notification-templates';
import { usePageTitle } from '@/hooks/use-page-title'

export default function NotificationSettingsPage() {
  usePageTitle('Notification Settings')
  const [preferences, setPreferences] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState('morning_motivation');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const {
    isSupported: oneSignalSupported,
    isSubscribed: oneSignalSubscribed,
    subscribe: subscribeOneSignal,
    unsubscribe: unsubscribeOneSignal,
    sendTestNotification: sendOneSignalTest
  } = useOneSignal();

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await fetch('/api/notifications/preferences');
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      toast.error('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePreference = async (key: string, value: boolean) => {
    try {
      const updated = { ...preferences, [key]: value };
      setPreferences(updated);

      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      toast.success('Preferences updated');
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update preferences');
    }
  };

  const handlePreviewNotification = (template: any) => {
    setSelectedTemplate(template);
  };

  const handleSendPreview = async () => {
    if (!selectedTemplate) return;

    try {
      if (oneSignalSubscribed) {
        await sendOneSignalTest();
        toast.success('Push notification sent!');
      } else {
        // Fallback to database preview if push notifications aren't enabled
        const response = await fetch('/api/notifications/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: selectedTemplate.title,
            message: selectedTemplate.message,
            type: selectedTemplate.type
          })
        });

        if (!response.ok) {
          throw new Error('Failed to send preview');
        }

        toast.success('Database notification sent!');
      }
    } catch (error) {
      console.error('Error sending preview:', error);
      toast.error('Failed to send preview');
    }
  };

  const categories = [
    { value: 'morning_motivation', label: '🌅 Morning Motivation', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'morning_motivation').length },
    { value: 'evening_reminder', label: '🌙 Evening Reminders', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'evening_reminder').length },
    { value: 'project_continuation', label: '💼 Project Reminders', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'project_continuation').length },
    { value: 'tip_of_day', label: '💡 Daily Tips', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'tip_of_day').length },
    { value: 'achievement', label: '🏆 Achievements', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'achievement').length },
    { value: 'productivity', label: '⚡ Productivity', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'productivity').length },
    { value: 'learning', label: '📚 Learning', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'learning').length },
    { value: 'community', label: '👥 Community', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'community').length },
    { value: 'milestone', label: '🎊 Milestones', count: NOTIFICATION_TEMPLATES.filter(t => t.category === 'milestone').length },
  ];

  const categoryTemplates = NOTIFICATION_TEMPLATES.filter(t => t.category === selectedCategory);

  if (loading) {
    return (
      <div className="container max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-400">Loading preferences...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Notification Settings</h1>
        <p className="text-gray-400">
          Customize when and how you receive notifications
        </p>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="preferences" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="preferences">
            <Settings className="w-4 h-4 mr-2" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="w-4 h-4 mr-2" />
            Preview Templates
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <Clock className="w-4 h-4 mr-2" />
            Schedule
          </TabsTrigger>
        </TabsList>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Browser Push Notifications</CardTitle>
              <CardDescription>
                {oneSignalSubscribed
                  ? 'You are subscribed to push notifications'
                  : 'Enable push notifications to receive updates in your browser'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {oneSignalSupported ? (
                oneSignalSubscribed ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500">Active</Badge>
                      <span className="text-sm text-gray-400">Push notifications enabled</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={unsubscribeOneSignal}>
                      Disable
                    </Button>
                  </div>
                ) : (
                  <Button onClick={subscribeOneSignal} className="w-full">
                    <Bell className="w-4 h-4 mr-2" />
                    Enable Push Notifications
                  </Button>
                )
              ) : (
                <div className="text-sm text-gray-400">
                  Push notifications are not supported in your browser
                </div>
              )}
            </CardContent>
          </Card>

          {preferences && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Notification Categories</CardTitle>
                  <CardDescription>
                    Choose which types of notifications you want to receive
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="morning">Morning Reminders</Label>
                      <p className="text-xs text-gray-400">Daily motivation at 9 AM</p>
                    </div>
                    <Switch
                      id="morning"
                      checked={preferences.morning_reminders}
                      onCheckedChange={(checked) => handleTogglePreference('morning_reminders', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="evening">Evening Reminders</Label>
                      <p className="text-xs text-gray-400">Evening wrap-up at 6 PM</p>
                    </div>
                    <Switch
                      id="evening"
                      checked={preferences.evening_reminders}
                      onCheckedChange={(checked) => handleTogglePreference('evening_reminders', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="projects">Project Reminders</Label>
                      <p className="text-xs text-gray-400">Continue working on your projects</p>
                    </div>
                    <Switch
                      id="projects"
                      checked={preferences.project_reminders}
                      onCheckedChange={(checked) => handleTogglePreference('project_reminders', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="tips">Tips & Features</Label>
                      <p className="text-xs text-gray-400">Learn new features and tips</p>
                    </div>
                    <Switch
                      id="tips"
                      checked={preferences.tips_and_features}
                      onCheckedChange={(checked) => handleTogglePreference('tips_and_features', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="achievements">Achievements</Label>
                      <p className="text-xs text-gray-400">Celebrate your milestones</p>
                    </div>
                    <Switch
                      id="achievements"
                      checked={preferences.achievement_notifications}
                      onCheckedChange={(checked) => handleTogglePreference('achievement_notifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="community">Community Updates</Label>
                      <p className="text-xs text-gray-400">News from the community</p>
                    </div>
                    <Switch
                      id="community"
                      checked={preferences.community_updates}
                      onCheckedChange={(checked) => handleTogglePreference('community_updates', checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notification Frequency</CardTitle>
                  <CardDescription>
                    Control how often you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select 
                      value={preferences.frequency}
                      onValueChange={(value) => handleTogglePreference('frequency', value as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal">Minimal (1-2 per day)</SelectItem>
                        <SelectItem value="optimal">Optimal (3-5 per day)</SelectItem>
                        <SelectItem value="maximum">Maximum (6+ per day)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400">
                      Our smart algorithm will optimize timing based on your activity
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preview Notification Templates</CardTitle>
              <CardDescription>
                Browse and preview {NOTIFICATION_TEMPLATES.length} notification templates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label} ({cat.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2">
                {categoryTemplates.map((template, index) => (
                  <div
                    key={index}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedTemplate === template
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                    onClick={() => handlePreviewNotification(template)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-white">{template.title}</h4>
                          {template.priority && template.priority >= 4 && (
                            <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{template.body}</p>
                        {template.tags && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {template.tags.slice(0, 3).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  This is how the notification will appear
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-w-md">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Bell className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white text-sm mb-1">
                        {selectedTemplate.title}
                      </h4>
                      <p className="text-xs text-gray-400">
                        {selectedTemplate.body}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">Just now • PiPilot</p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSendPreview}
                  className="w-full mt-4"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Test Notification
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Schedule</CardTitle>
              <CardDescription>
                View your upcoming scheduled notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Scheduled notifications will appear here</p>
                <p className="text-sm mt-2">
                  Our smart algorithm schedules notifications based on your activity patterns
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
