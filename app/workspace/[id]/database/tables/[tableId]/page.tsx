"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, RefreshCw, Plus, Database, Table as TableIcon } from "lucide-react";
import { toast } from "sonner";
import { DataGrid } from "@/components/database/data-grid";
import { AddRecordDialog } from "@/components/database/add-record-dialog";
import { EditRecordDialog } from "@/components/database/edit-record-dialog";
import { DeleteRecordDialog } from "@/components/database/delete-record-dialog";
import { getWorkspaceDatabaseId } from "@/lib/get-current-workspace";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import type { Table } from "@/lib/supabase";
import { usePageTitle } from '@/hooks/use-page-title'

interface RecordData {
  id: number;
  [key: string]: any;
}

export default function TableRecordsPage() {
  usePageTitle('Database Table')
  const params = useParams();
  const router = useRouter();
  const [table, setTable] = useState<Table | null>(null);
  const [records, setRecords] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordData | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<RecordData | null>(null);
  const [databaseId, setDatabaseId] = useState<string | null>(null);

  const workspaceId = params.id as string;
  const tableId = params.tableId as string;

  useEffect(() => {
    initializeData();
  }, [workspaceId, tableId]);

  // Auto-refresh records every 5 seconds
  useEffect(() => {
    if (!table || !databaseId) return; // Only start auto-refresh after table is loaded

    const interval = setInterval(() => {
      silentRefresh();
    }, 5000); // 5 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, [table, databaseId]);

  async function initializeData() {
    try {
      setLoading(true);

      // First, get the database ID from the workspace
      const dbId = await getWorkspaceDatabaseId(workspaceId);
      
      if (!dbId) {
        toast.error("No database found for this workspace");
        router.push(`/workspace/${workspaceId}/database`);
        return;
      }

      setDatabaseId(dbId.toString());
      await loadData(dbId.toString());
    } catch (error: any) {
      console.error("Error initializing data:", error);
      toast.error(error.message || "Failed to initialize");
    } finally {
      setLoading(false);
    }
  }

  async function loadData(dbId: string) {
    try {
      // Get table details
      const tableResponse = await fetch(`/api/database/${dbId}/tables/${tableId}`);
      const tableData = await tableResponse.json();

      if (!tableResponse.ok) {
        throw new Error(tableData.error || "Failed to load table");
      }

      setTable(tableData.table);

      // Get records
      await loadRecords(dbId);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error(error.message || "Failed to load data");
    }
  }

  async function loadRecords(dbId: string, silent = false) {
    try {
      const response = await fetch(
        `/api/database/${dbId}/tables/${tableId}/records`
      );
      const data = await response.json();

      if (response.ok) {
        setRecords(data.records || []);
      } else {
        if (!silent) {
          throw new Error(data.error || "Failed to load records");
        }
      }
    } catch (error: any) {
      if (!silent) {
        console.error("Error loading records:", error);
        toast.error("Failed to load records");
      }
    }
  }

  // Silent refresh function for auto-updates (no loading states or success messages)
  async function silentRefresh() {
    if (databaseId) {
      await loadRecords(databaseId, true); // true = silent mode
    }
  }

  async function handleRefresh() {
    if (!databaseId) return;
    setRefreshing(true);
    await loadRecords(databaseId);
    setRefreshing(false);
    toast.success("Records refreshed");
  }

  const handleRecordsRefresh = async () => {
    if (databaseId) {
      await loadRecords(databaseId);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 flex items-center justify-center min-h-screen pt-16">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!table) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Table Not Found</CardTitle>
                <CardDescription className="text-gray-400">
                  Unable to load table details. Please try again.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 lovable-gradient" />
      <div className="absolute inset-0 noise-texture" />
      <Navigation />
      <div className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push(`/workspace/${params.workspaceId || params.id}/database`)}
                className="text-white hover:bg-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-white">{table.name}</h1>
                <p className="text-gray-400">
                  {records.length} record{records.length !== 1 ? "s" : ""} •{" "}
                  {(table.schema_json as any).columns?.length || 0} columns
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-gray-700 text-white hover:bg-gray-800"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <AddRecordDialog
                table={table}
                databaseId={databaseId || ""}
                onSuccess={handleRecordsRefresh}
              >
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Record
                </Button>
              </AddRecordDialog>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white">Records</CardTitle>
                <Database className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{records.length}</div>
                <p className="text-xs text-gray-400">
                  {records.length === 1 ? 'record' : 'records'} in table
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white">Columns</CardTitle>
                <TableIcon className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {(table.schema_json as any).columns?.length || 0}
                </div>
                <p className="text-xs text-gray-400">
                  table columns
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white">Table ID</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium text-white">
                  {table.id}
                </div>
                <p className="text-xs text-gray-400">
                  unique identifier
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Data Grid */}
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6">
              <DataGrid
                table={table}
                records={records}
                loading={refreshing}
                onEdit={setEditingRecord}
                onDelete={setDeletingRecord}
                onRefresh={handleRecordsRefresh}
              />
            </CardContent>
          </Card>

          {/* Edit Dialog */}
          {editingRecord && (
            <EditRecordDialog
              table={table}
              databaseId={databaseId || ""}
              record={editingRecord}
              open={!!editingRecord}
              onOpenChange={(open) => !open && setEditingRecord(null)}
              onSuccess={() => {
                handleRecordsRefresh();
                setEditingRecord(null);
              }}
            />
          )}

          {/* Delete Dialog */}
          {deletingRecord && (
            <DeleteRecordDialog
              table={table}
              databaseId={databaseId || ""}
              record={deletingRecord}
              open={!!deletingRecord}
              onOpenChange={(open) => !open && setDeletingRecord(null)}
              onSuccess={() => {
                handleRecordsRefresh();
                setDeletingRecord(null);
              }}
            />
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
