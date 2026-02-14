"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Database,
  Table,
  Key,
  Link as LinkIcon,
  Search,
  Eye,
  EyeOff,
  Maximize2,
  Download,
  RefreshCw,
  Hash,
  Type,
  Calendar,
  CheckSquare,
  FileText
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Column {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
  foreignKey?: {
    table: string
    column: string
  }
  defaultValue?: string
}

interface TableSchema {
  name: string
  columns: Column[]
  rowCount: number
  relationships: {
    type: "one-to-many" | "many-to-one" | "many-to-many"
    targetTable: string
    via?: string
  }[]
}

export function SchemaVisualizer() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTable, setSelectedTable] = useState<string | null>("users")
  const [hiddenTables, setHiddenTables] = useState<Set<string>>(new Set())
  const [isCompact, setIsCompact] = useState(false)

  // Mock schema data
  const tables: TableSchema[] = [
    {
      name: "users",
      rowCount: 1247,
      columns: [
        { name: "id", type: "uuid", nullable: false, primaryKey: true, defaultValue: "uuid_generate_v4()" },
        { name: "email", type: "text", nullable: false },
        { name: "name", type: "text", nullable: true },
        { name: "avatar_url", type: "text", nullable: true },
        { name: "created_at", type: "timestamp", nullable: false, defaultValue: "now()" },
        { name: "updated_at", type: "timestamp", nullable: true }
      ],
      relationships: [
        { type: "one-to-many", targetTable: "posts" },
        { type: "one-to-many", targetTable: "comments" },
        { type: "many-to-many", targetTable: "roles", via: "user_roles" }
      ]
    },
    {
      name: "posts",
      rowCount: 3891,
      columns: [
        { name: "id", type: "uuid", nullable: false, primaryKey: true },
        { name: "user_id", type: "uuid", nullable: false, foreignKey: { table: "users", column: "id" } },
        { name: "title", type: "text", nullable: false },
        { name: "content", type: "text", nullable: true },
        { name: "published", type: "boolean", nullable: false, defaultValue: "false" },
        { name: "created_at", type: "timestamp", nullable: false },
        { name: "updated_at", type: "timestamp", nullable: true }
      ],
      relationships: [
        { type: "many-to-one", targetTable: "users" },
        { type: "one-to-many", targetTable: "comments" }
      ]
    },
    {
      name: "comments",
      rowCount: 8423,
      columns: [
        { name: "id", type: "uuid", nullable: false, primaryKey: true },
        { name: "post_id", type: "uuid", nullable: false, foreignKey: { table: "posts", column: "id" } },
        { name: "user_id", type: "uuid", nullable: false, foreignKey: { table: "users", column: "id" } },
        { name: "content", type: "text", nullable: false },
        { name: "created_at", type: "timestamp", nullable: false }
      ],
      relationships: [
        { type: "many-to-one", targetTable: "posts" },
        { type: "many-to-one", targetTable: "users" }
      ]
    },
    {
      name: "roles",
      rowCount: 5,
      columns: [
        { name: "id", type: "uuid", nullable: false, primaryKey: true },
        { name: "name", type: "text", nullable: false },
        { name: "permissions", type: "jsonb", nullable: true }
      ],
      relationships: [
        { type: "many-to-many", targetTable: "users", via: "user_roles" }
      ]
    },
    {
      name: "user_roles",
      rowCount: 1534,
      columns: [
        { name: "user_id", type: "uuid", nullable: false, primaryKey: true, foreignKey: { table: "users", column: "id" } },
        { name: "role_id", type: "uuid", nullable: false, primaryKey: true, foreignKey: { table: "roles", column: "id" } },
        { name: "assigned_at", type: "timestamp", nullable: false, defaultValue: "now()" }
      ],
      relationships: [
        { type: "many-to-one", targetTable: "users" },
        { type: "many-to-one", targetTable: "roles" }
      ]
    }
  ]

  const filteredTables = tables.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !hiddenTables.has(t.name)
  )

  const selectedTableData = tables.find(t => t.name === selectedTable)

  const toggleTableVisibility = (tableName: string) => {
    const newHidden = new Set(hiddenTables)
    if (newHidden.has(tableName)) {
      newHidden.delete(tableName)
    } else {
      newHidden.add(tableName)
    }
    setHiddenTables(newHidden)
  }

  const getTypeIcon = (type: string) => {
    if (type.includes("uuid") || type.includes("id")) return <Key className="h-3 w-3" />
    if (type.includes("int") || type.includes("numeric")) return <Hash className="h-3 w-3" />
    if (type.includes("text") || type.includes("varchar")) return <Type className="h-3 w-3" />
    if (type.includes("timestamp") || type.includes("date")) return <Calendar className="h-3 w-3" />
    if (type.includes("boolean")) return <CheckSquare className="h-3 w-3" />
    if (type.includes("json")) return <FileText className="h-3 w-3" />
    return <Database className="h-3 w-3" />
  }

  const getRelationshipColor = (type: string) => {
    switch (type) {
      case "one-to-many": return "text-blue-400"
      case "many-to-one": return "text-green-400"
      case "many-to-many": return "text-purple-400"
      default: return "text-gray-400"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Schema
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsCompact(!isCompact)}>
                <Maximize2 className="h-4 w-4 mr-2" />
                {isCompact ? "Expand" : "Compact"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Badge variant="outline">{filteredTables.length} tables</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Tables List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Tables</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <div className="space-y-1 p-4">
                {filteredTables.map((table) => (
                  <div
                    key={table.name}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors group",
                      selectedTable === table.name
                        ? "bg-purple-500/20 border border-purple-500/30"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedTable(table.name)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <Table className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{table.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {table.rowCount.toLocaleString()} rows
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="md:opacity-0 md:group-hover:opacity-100 h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleTableVisibility(table.name)
                      }}
                    >
                      {hiddenTables.has(table.name) ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Table Details */}
        <div className="lg:col-span-3 space-y-6">
          {selectedTableData ? (
            <>
              {/* Table Info */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Table className="h-5 w-5" />
                        {selectedTableData.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedTableData.columns.length} columns · {selectedTableData.rowCount.toLocaleString()} rows
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-400">
                      Active
                    </Badge>
                  </div>
                </CardHeader>
              </Card>

              {/* Columns */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Columns</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 text-sm font-semibold">Name</th>
                          <th className="text-left p-2 text-sm font-semibold">Type</th>
                          <th className="text-left p-2 text-sm font-semibold">Constraints</th>
                          <th className="text-left p-2 text-sm font-semibold">Default</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTableData.columns.map((column, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                {getTypeIcon(column.type)}
                                <span className="font-mono text-sm">{column.name}</span>
                                {column.primaryKey && (
                                  <Badge variant="outline" className="bg-yellow-500/10 border-yellow-500/30 text-yellow-400 text-[10px] px-1">
                                    PK
                                  </Badge>
                                )}
                                {column.foreignKey && (
                                  <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-400 text-[10px] px-1">
                                    FK
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">{column.type}</code>
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                {!column.nullable && (
                                  <Badge variant="outline" className="text-[10px] px-1">NOT NULL</Badge>
                                )}
                                {column.foreignKey && (
                                  <div className="flex items-center gap-1 text-xs text-blue-400">
                                    <LinkIcon className="h-3 w-3" />
                                    <span>{column.foreignKey.table}.{column.foreignKey.column}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              {column.defaultValue && (
                                <code className="text-xs text-muted-foreground">{column.defaultValue}</code>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Relationships */}
              {selectedTableData.relationships.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <LinkIcon className="h-5 w-5" />
                      Relationships
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedTableData.relationships.map((rel, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedTable(rel.targetTable)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn("flex items-center gap-2", getRelationshipColor(rel.type))}>
                              <LinkIcon className="h-4 w-4" />
                              <Badge variant="outline" className="text-[10px]">
                                {rel.type.toUpperCase()}
                              </Badge>
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {selectedTableData.name} → {rel.targetTable}
                              </div>
                              {rel.via && (
                                <div className="text-xs text-muted-foreground">
                                  via {rel.via}
                                </div>
                              )}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm">
                            View Table
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Visual ER Diagram */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Entity Relationship Diagram</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted/30 rounded-lg p-8 min-h-[300px] flex items-center justify-center">
                    <div className="relative w-full max-w-4xl">
                      {/* Center table */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="bg-purple-500/20 border-2 border-purple-500/50 rounded-lg p-4 min-w-[200px]">
                          <div className="flex items-center gap-2 mb-3">
                            <Table className="h-4 w-4" />
                            <span className="font-bold">{selectedTableData.name}</span>
                          </div>
                          <div className="space-y-1 text-xs">
                            {selectedTableData.columns.slice(0, 4).map((col, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                {col.primaryKey && <Key className="h-3 w-3 text-yellow-400" />}
                                <span className="text-muted-foreground">{col.name}</span>
                              </div>
                            ))}
                            {selectedTableData.columns.length > 4 && (
                              <div className="text-muted-foreground">...</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Related tables */}
                      {selectedTableData.relationships.map((rel, idx) => {
                        const angle = (idx * 360) / selectedTableData.relationships.length
                        const radius = 200
                        const x = Math.cos((angle * Math.PI) / 180) * radius
                        const y = Math.sin((angle * Math.PI) / 180) * radius
                        
                        return (
                          <div
                            key={idx}
                            className="absolute top-1/2 left-1/2"
                            style={{
                              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
                            }}
                          >
                            <div className="bg-muted border border-border rounded-lg p-3 min-w-[150px] hover:border-purple-500/50 transition-colors cursor-pointer"
                              onClick={() => setSelectedTable(rel.targetTable)}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <Table className="h-3 w-3" />
                                <span className="font-semibold text-sm">{rel.targetTable}</span>
                              </div>
                              <Badge variant="outline" className="text-[9px]">
                                {rel.type}
                              </Badge>
                            </div>
                            {/* Connection line */}
                            <svg
                              className="absolute top-1/2 left-1/2 pointer-events-none"
                              style={{
                                width: Math.abs(x) + 100,
                                height: Math.abs(y) + 100,
                                transform: `translate(${x > 0 ? '-100%' : '0'}, ${y > 0 ? '-100%' : '0'})`
                              }}
                            >
                              <line
                                x1={x > 0 ? "100%" : "0"}
                                y1={y > 0 ? "100%" : "0"}
                                x2={x > 0 ? "0" : "100%"}
                                y2={y > 0 ? "0" : "100%"}
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeDasharray="5,5"
                                className={getRelationshipColor(rel.type)}
                                opacity="0.5"
                              />
                            </svg>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Database className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                <p className="text-muted-foreground">Select a table to view its schema</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
