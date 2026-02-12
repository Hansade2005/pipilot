"use client"

import { useState } from "react"
import { Database, Zap } from "lucide-react"
import { DatabaseTab } from "./database-tab/database-tab"
import { AIPplatformTab } from "./ai-platform-tab"
import type { User } from "@supabase/supabase-js"
import type { Workspace } from "@/lib/storage-manager"

interface CloudTabProps {
    user: User
    selectedProject: Workspace | null
}

export function CloudTab({ user, selectedProject }: CloudTabProps) {
    const [activeCloudTab, setActiveCloudTab] = useState<"database" | "ai-platform">("database")

    return (
        <div className="h-full flex flex-col bg-gray-950">
            {/* Internal Tab Switcher */}
            <div className="border-b border-gray-700/60 bg-gray-900/80 p-2 flex-shrink-0">
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveCloudTab("database")}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            activeCloudTab === "database"
                                ? "bg-orange-600/15 text-orange-400"
                                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                        }`}
                    >
                        <Database className="h-3.5 w-3.5" />
                        <span>Database</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveCloudTab("ai-platform")}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            activeCloudTab === "ai-platform"
                                ? "bg-orange-600/15 text-orange-400"
                                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                        }`}
                    >
                        <Zap className="h-3.5 w-3.5" />
                        <span>AI Platform</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0">
                {activeCloudTab === "database" ? (
                    <DatabaseTab workspaceId={selectedProject?.id || ""} />
                ) : (
                    <AIPplatformTab user={user} />
                )}
            </div>
        </div>
    )
}
