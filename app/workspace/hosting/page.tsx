'use client';

import { useState, useEffect, Suspense } from 'react';
import { VercelDeploymentManager } from '@/components/vercel-deployment-manager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Rocket, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { storageManager } from '@/lib/storage-manager';
import { getDeploymentTokens } from '@/lib/cloud-sync';
import { useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/hooks/use-page-title'

// Vercel-style Footer Component
function VercelFooter() {
  const [theme, setTheme] = useState('light');

  // Initialize theme based on current document class
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-black/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        {/* Desktop Layout */}
        <div className="hidden md:flex items-center justify-between">
          {/* Left side - Navigation */}
          <div className="flex items-center space-x-6">
            <a 
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Home
            </a>
            <a 
              href="https://pipilot.dev/workspace"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Workspace
            </a>
          </div>

          {/* Center - Status */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              All systems normal
            </span>
          </div>

          {/* Right side - Theme selector */}
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-600 dark:text-gray-400 hidden lg:block">
              Select a display theme:
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setTheme('light');
                  document.documentElement.classList.remove('dark');
                }}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  theme === 'light'
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                light
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  document.documentElement.classList.add('dark');
                }}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                dark
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <a 
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Home
            </a>
            <a 
              href="https://pipilot.dev/workspace"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Workspace
            </a>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Normal
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => {
                  setTheme('light');
                  document.documentElement.classList.remove('dark');
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  theme === 'light'
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                light
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  document.documentElement.classList.add('dark');
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                dark
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function HostingManagementContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [vercelToken, setVercelToken] = useState<string | undefined>(undefined);
  const [githubToken, setGithubToken] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    initializeHosting();
  }, [projectId]);

  const initializeHosting = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('You must be logged in to access hosting management');
      }

      setUserId(user.id);

      // Initialize storage manager
      await storageManager.init();

      // Load stored tokens using getDeploymentTokens
      const tokens = await getDeploymentTokens(user.id);
      console.log('Loaded tokens:', tokens);

      if (tokens) {
        if (tokens.vercel) {
          setVercelToken(tokens.vercel);
        }

        if (tokens.github) {
          setGithubToken(tokens.github);
        }
      }

      // If project ID is provided, use it as workspace ID
      if (projectId) {
        setWorkspaceId(projectId);
      } else {
        // Get the first workspace if no project specified
        const workspaces = await storageManager.getWorkspaces(user.id);
        if (workspaces && workspaces.length > 0) {
          setWorkspaceId(workspaces[0].id);
        } else {
          throw new Error('No workspaces found. Please create a project first.');
        }
      }

    } catch (err: any) {
      console.error('Hosting initialization error:', err);
      setError(err.message || 'Failed to initialize hosting management');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-black">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-orange-500" />
          <p className="text-gray-600 dark:text-gray-400">Loading hosting management...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-black p-6">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Error Loading Hosting Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>To fix this issue:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Make sure you're logged in</li>
                <li>Create a project in your workspace</li>
                <li>Set up your Vercel and GitHub tokens in Account Settings</li>
              </ul>
              <div className="flex gap-2 mt-4">
                <a 
                  href="/workspace" 
                  className="text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300 underline"
                >
                  Go to Workspace
                </a>
                <span className="text-gray-400 dark:text-gray-600">|</span>
                <a 
                  href="/workspace/account" 
                  className="text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300 underline"
                >
                  Account Settings
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-black p-6">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle className="text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              <Info className="w-5 h-5" />
              No Workspace Selected
            </CardTitle>
            <CardDescription>
              You need to create a project before accessing hosting management.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a 
              href="/workspace" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
            >
              <Rocket className="w-4 h-4" />
              Go to Workspace
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen m-0 p-0 hosting-container">
      {/* Alert notification - only show if tokens missing */}
      {(!vercelToken || !githubToken) && (
        <div className="w-full bg-orange-50 dark:bg-orange-950 border-b border-orange-200 dark:border-orange-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <Alert className="border-orange-200 dark:border-orange-800 bg-transparent">
              <Info className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <AlertDescription className="text-orange-800 dark:text-orange-200">
                <strong>Tip:</strong> You haven't configured your API tokens yet. You can add them in{' '}
                <a href="/workspace/account" className="text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300 underline">
                  Account Settings
                </a>{' '}
                or enter them directly in the form below.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      <VercelDeploymentManager
        workspaceId={workspaceId}
        vercelToken={vercelToken}
        githubToken={githubToken}
      />

      {/* Vercel-style Footer */}
      <VercelFooter />
    </div>
  );
}

export default function HostingManagementPage() {
  usePageTitle('Hosting Management')
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-black">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-orange-500" />
          <p className="text-gray-600 dark:text-gray-400">Loading hosting management...</p>
        </div>
      </div>
    }>
      <HostingManagementContent />
    </Suspense>
  );
}
