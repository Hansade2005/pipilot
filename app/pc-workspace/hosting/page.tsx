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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-500" />
          <p className="text-gray-400">Loading hosting management...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black p-6">
        <Card className="max-w-2xl w-full bg-gray-800 border-red-900">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Error Loading Hosting Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 space-y-2 text-sm text-gray-400">
              <p>To fix this issue:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Make sure you're logged in</li>
                <li>Create a project in your workspace</li>
                <li>Set up your Vercel and GitHub tokens in Account Settings</li>
              </ul>
              <div className="flex gap-2 mt-4">
                <a 
                  href="/pc-workspace" 
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Go to Workspace
                </a>
                <span className="text-gray-600">|</span>
                <a 
                  href="/pc-workspace/account" 
                  className="text-blue-400 hover:text-blue-300 underline"
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black p-6">
        <Card className="max-w-2xl w-full bg-gray-800 border-yellow-900">
          <CardHeader>
            <CardTitle className="text-yellow-400 flex items-center gap-2">
              <Info className="w-5 h-5" />
              No Workspace Selected
            </CardTitle>
            <CardDescription className="text-gray-400">
              You need to create a project before accessing hosting management.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a 
              href="/pc-workspace" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black">
      {/* Header with branding */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Rocket className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Hosting Management</h1>
                <p className="text-sm text-gray-400">Deploy and manage your projects with Vercel</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/pc-workspace"
                className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                ← Back to Workspace
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto p-6">
        {(!vercelToken || !githubToken) && (
          <Alert className="mb-6 bg-blue-900/20 border-blue-700">
            <Info className="w-4 h-4 text-blue-400" />
            <AlertDescription className="text-gray-300">
              <strong>Tip:</strong> You haven't configured your API tokens yet. You can add them in{' '}
              <a href="/pc-workspace/account" className="text-blue-400 hover:text-blue-300 underline">
                Account Settings
              </a>{' '}
              or enter them directly in the form below.
            </AlertDescription>
          </Alert>
        )}

        <VercelDeploymentManager
          workspaceId={workspaceId}
          vercelToken={vercelToken}
          githubToken={githubToken}
        />
      </div>

      {/* Footer info */}
      <div className="max-w-7xl mx-auto px-6 py-8 mt-12 border-t border-gray-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-400">
          <div>
            <h3 className="font-semibold text-white mb-2">Getting Started</h3>
            <ul className="space-y-1">
              <li>
                <a href="https://vercel.com/docs" target="_blank" className="hover:text-gray-300">
                  Vercel Documentation
                </a>
              </li>
              <li>
                <a href="https://vercel.com/account/tokens" target="_blank" className="hover:text-gray-300">
                  Create Vercel Token
                </a>
              </li>
              <li>
                <a href="https://github.com/settings/tokens" target="_blank" className="hover:text-gray-300">
                  Create GitHub Token
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-2">Features</h3>
            <ul className="space-y-1">
              <li>✓ Git-based deployments</li>
              <li>✓ Custom domains</li>
              <li>✓ Environment variables</li>
              <li>✓ Real-time build logs</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-2">Need Help?</h3>
            <ul className="space-y-1">
              <li>
                <a href="/docs" className="hover:text-gray-300">
                  Documentation
                </a>
              </li>
              <li>
                <a href="/community" className="hover:text-gray-300">
                  Community Support
                </a>
              </li>
              <li>
                <a href="mailto:support@example.com" className="hover:text-gray-300">
                  Contact Support
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HostingManagementPage() {
  usePageTitle('Hosting Management')
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-500" />
          <p className="text-gray-400">Loading hosting management...</p>
        </div>
      </div>
    }>
      <HostingManagementContent />
    </Suspense>
  );
}
