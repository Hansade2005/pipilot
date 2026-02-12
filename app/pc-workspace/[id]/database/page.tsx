'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentWorkspace, setWorkspaceDatabase } from '@/lib/get-current-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Plus, AlertCircle, Loader2, Table as TableIcon, Sparkles, Key, Book, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { CreateTableDialog } from '@/components/database/create-table-dialog';
import { TableDetailsView } from '@/components/database/table-details-view';
import { EditTableDialog } from '@/components/database/edit-table-dialog';
import { DeleteTableDialog } from '@/components/database/delete-table-dialog';
import { AISchemaGenerator } from '@/components/database/ai-schema-generator';
import ApiKeysManager from '@/components/database/api-keys-manager';
import StorageManager from '@/components/database/storage-manager';
import { ApiDocsGenerator } from '@/components/database/api-docs-generator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Table } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/use-page-title'

interface DatabaseData {
  id: number;
  name: string;
  project_id: string;
  created_at: string;
}

interface TableWithCount extends Table {
  recordCount: number;
}

export default function DatabasePage() {
  usePageTitle('Project Database')
  const params = useParams();
  const [workspace, setWorkspace] = useState<any>(null);
  const [database, setDatabase] = useState<DatabaseData | null>(null);
  const [tables, setTables] = useState<TableWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [databaseName, setDatabaseName] = useState('');
  const [editingTable, setEditingTable] = useState<TableWithCount | null>(null);
  const [deletingTable, setDeletingTable] = useState<TableWithCount | null>(null);
  const [showAISchemaGenerator, setShowAISchemaGenerator] = useState(false);
  const [showApiDocsGenerator, setShowApiDocsGenerator] = useState(false);
  const [activeTab, setActiveTab] = useState('tables');

  useEffect(() => {
    loadData();
  }, [params.id]);

  // Auto-refresh data every 5 seconds
  useEffect(() => {
    if (!database) return; // Only start auto-refresh after database is loaded

    const interval = setInterval(() => {
      silentRefresh();
    }, 5000); // 5 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, [database]);

  async function loadData() {
    try {
      setLoading(true);

      // Get current workspace
      const ws = await getCurrentWorkspace();
      if (!ws) {
        toast.error('Workspace not found');
        return;
      }
      setWorkspace(ws);

      // Set default database name
      if (!databaseName) {
        setDatabaseName(`${ws.name}_db`);
      }

      // Check if database exists
      if (ws.databaseId) {
        await loadDatabase(ws.databaseId);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load database');
    } finally {
      setLoading(false);
    }
  }

  // Silent refresh function for auto-updates (no loading states or success messages)
  async function silentRefresh() {
    try {
      if (!workspace?.databaseId) return;

      // Get current workspace (silently)
      const ws = await getCurrentWorkspace();
      if (!ws || !ws.databaseId) return;

      // Load database data silently
      await loadDatabase(ws.databaseId, true); // true = silent mode
    } catch (error) {
      // Only log errors, don't show toasts for silent refresh
      console.error('Silent refresh error:', error);
    }
  }

  async function loadDatabase(databaseId: number, silent = false) {
    try {
      const response = await fetch(`/api/database/${databaseId}`);
      const data = await response.json();

      if (data.success) {
        setDatabase(data.database);
        // Transform tables to match our interface
        const transformedTables = (data.tables || []).map((table: any) => ({
          ...table,
          recordCount: table.record_count || 0,
        }));
        setTables(transformedTables);
      } else {
        if (!silent) {
          console.error('Failed to load database:', data.error);
        }
      }
    } catch (error) {
      if (!silent) {
        console.error('Error fetching database:', error);
      }
    }
  }

  async function createDatabase() {
    if (!workspace) return;
    
    // Validate database name
    if (!databaseName || databaseName.trim().length === 0) {
      toast.error('Please enter a database name');
      return;
    }
    
    // Validate database name format (alphanumeric, underscores, hyphens)
    if (!/^[a-zA-Z0-9_-]+$/.test(databaseName.trim())) {
      toast.error('Database name can only contain letters, numbers, underscores, and hyphens');
      return;
    }

    try {
      setCreating(true);

      const response = await fetch('/api/database/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: workspace.id,
          name: databaseName.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle HTTP errors
        if (response.status === 401) {
          toast.error('Authentication required. Please log in again.');
        } else if (response.status === 400) {
          toast.error(data.error || 'Invalid request');
        } else {
          toast.error(data.error || `Failed to create database (Error ${response.status})`);
        }
        return;
      }

      if (data.success) {
        toast.success('Database created successfully!');
        
        // Update workspace in IndexedDB
        await setWorkspaceDatabase(workspace.id, data.database.id);
        
        // Reload data
        await loadData();
      } else {
        toast.error(data.error || 'Failed to create database');
      }
    } catch (error) {
      console.error('Error creating database:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create database. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <div className="relative z-10 flex items-center justify-center min-h-screen pt-16">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <div className="relative z-10 pt-16 pb-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Workspace Not Found
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Unable to load workspace. Please try refreshing the page.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <div className="relative z-10 pt-16 pb-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl py-8">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
                  <Database className="h-8 w-8 text-blue-400" />
                </div>
                <CardTitle className="text-2xl text-white">Create Database</CardTitle>
                <CardDescription className="text-gray-400">
                  Set up a database for <strong className="text-white">{workspace.name}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="databaseName" className="text-white">
                      Database Name
                    </Label>
                    <Input
                      id="databaseName"
                      type="text"
                      placeholder="my_app_db"
                      value={databaseName}
                      onChange={(e) => setDatabaseName(e.target.value)}
                      className="bg-gray-900/50 border-gray-700 text-white placeholder:text-gray-500"
                      disabled={creating}
                    />
                    <p className="text-xs text-gray-500">
                      Use letters, numbers, underscores, and hyphens only
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-2">
                  <h3 className="font-medium text-white">What you'll get:</h3>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400">✓</span>
                      <span>A fully functional database with authentication</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400">✓</span>
                      <span>Auto-generated users table for login/signup</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400">✓</span>
                      <span>Visual table builder with AI assistance</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400">✓</span>
                      <span>REST API endpoints for your app</span>
                    </li>
                  </ul>
                </div>

                <Button 
                  onClick={createDatabase} 
                  disabled={creating}
                  className="w-full"
                  size="lg"
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Database...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Create Database
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 lovable-gradient" />
      <div className="absolute inset-0 noise-texture" />
      <div className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl py-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-white break-words">{database.name}</h1>
            <p className="text-gray-400 text-sm sm:text-base">
              Manage tables and records for {workspace.name}
            </p>
          </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">Tables</CardTitle>
            <TableIcon className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{tables.length}</div>
            <p className="text-xs text-gray-400">
              {tables.length === 1 ? 'table' : 'tables'} created
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">Total Records</CardTitle>
            <Database className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {tables.reduce((sum, table) => sum + table.recordCount, 0)}
            </div>
            <p className="text-xs text-gray-400">
              across all tables
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-white">
              {new Date(database.created_at).toLocaleDateString()}
            </div>
            <p className="text-xs text-gray-400">
              {new Date(database.created_at).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Tables, Storage, and API Keys */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-gray-800 border-gray-700 grid grid-cols-3 w-full sm:w-auto">
          <TabsTrigger value="tables" className="data-[state=active]:bg-gray-700">
            <TableIcon className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Tables</span>
          </TabsTrigger>
          <TabsTrigger value="storage" className="data-[state=active]:bg-gray-700">
            <HardDrive className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Storage</span>
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="data-[state=active]:bg-gray-700">
            <Key className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
        </TabsList>

        {/* Tables Tab */}
        <TabsContent value="tables" className="space-y-4 mt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Tables</h2>
              <p className="text-gray-400 text-sm sm:text-base">
                Manage your database tables and schemas
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setShowApiDocsGenerator(true)}
                className="flex items-center gap-2 border-gray-700 text-white hover:bg-gray-800"
                size="sm"
              >
                <Book className="h-4 w-4" />
                <span className="hidden sm:inline">API Docs</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAISchemaGenerator(true)}
                className="flex items-center gap-2 border-gray-700 text-white hover:bg-gray-800"
                size="sm"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Generate with AI</span>
              </Button>
              <CreateTableDialog
                databaseId={database.id.toString()}
                onSuccess={() => loadDatabase(database.id)}
              />
            </div>
          </div>

        {tables.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="text-center py-12">
              <TableIcon className="mx-auto h-12 w-12 mb-4 opacity-20 text-gray-600" />
              <p className="text-gray-400 mb-4">
                No tables yet. Create your first table to get started.
              </p>
              <CreateTableDialog
                databaseId={database.id.toString()}
                onSuccess={() => loadDatabase(database.id)}
              >
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Table
                </Button>
              </CreateTableDialog>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tables.map((table) => (
              <TableDetailsView
                key={table.id}
                table={table}
                onEdit={() => setEditingTable(table)}
                onDelete={() => setDeletingTable(table)}
              />
            ))}
          </div>
        )}
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="mt-0">
          <StorageManager databaseId={database.id.toString()} />
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="mt-0">
          <ApiKeysManager databaseId={database.id.toString()} />
        </TabsContent>
      </Tabs>

      {/* Edit Table Dialog */}
      {editingTable && (
        <EditTableDialog
          table={editingTable}
          databaseId={database.id.toString()}
          open={!!editingTable}
          onOpenChange={(open) => !open && setEditingTable(null)}
          onSuccess={() => {
            loadDatabase(database.id);
            setEditingTable(null);
          }}
        />
      )}

      {/* Delete Table Dialog */}
      {deletingTable && (
        <DeleteTableDialog
          table={deletingTable}
          databaseId={database.id.toString()}
          open={!!deletingTable}
          onOpenChange={(open) => !open && setDeletingTable(null)}
          onSuccess={() => {
            loadDatabase(database.id);
            setDeletingTable(null);
          }}
        />
      )}

      {/* API Docs Generator Dialog */}
      <ApiDocsGenerator
        databaseId={database.id.toString()}
        tables={tables.map(t => ({
          id: t.id.toString(),
          name: t.name,
          schema: t.schema_json
        }))}
        open={showApiDocsGenerator}
        onOpenChange={setShowApiDocsGenerator}
      />

      {/* AI Schema Generator Dialog */}
      <Dialog open={showAISchemaGenerator} onOpenChange={setShowAISchemaGenerator}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Table Schema with AI</DialogTitle>
          </DialogHeader>
          <AISchemaGenerator
            workspaceId={workspace.id}
            databaseId={database.id.toString()}
            onSchemaGenerated={(schema) => {
              console.log('Schema generated:', schema);
            }}
            onCreateTable={async (schema) => {
              try {
                // Convert AI schema to table creation format
                const tableData = {
                  name: schema.tableName,
                  schema_json: {
                    columns: schema.columns.map(col => ({
                      name: col.name,
                      type: col.type,
                      required: col.required || false,
                      defaultValue: col.defaultValue || null,
                      unique: col.unique || false,
                      primary_key: col.name === 'id',
                      description: col.description || '',
                      references: col.references || null
                    })),
                    indexes: schema.indexes || []
                  }
                };

                console.log('[Create Table] Sending request:', tableData);

                // Create the table using the correct endpoint
                const response = await fetch(`/api/database/${database.id}/tables/create`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(tableData)
                });

                console.log('[Create Table] Response status:', response.status);

                if (!response.ok) {
                  const errorData = await response.json();
                  console.error('[Create Table] Error response:', errorData);
                  throw new Error(errorData.error || 'Failed to create table');
                }

                const result = await response.json();
                console.log('[Create Table] Success:', result);

                toast.success(`Table "${schema.tableName}" created successfully!`);
                setShowAISchemaGenerator(false);
                await loadDatabase(database.id);
              } catch (error) {
                console.error('Error creating table from AI schema:', error);
                toast.error(error instanceof Error ? error.message : 'Failed to create table');
              }
            }}
          />
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
}
