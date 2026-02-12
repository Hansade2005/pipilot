"use client"

import { useState } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { FileText, Search, CheckCircle, Shield, Menu, X } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { DocsTab } from "./audit-tabs/docs-tab"
import { ReviewTab } from "./audit-tabs/review-tab"
import { QualityTab } from "./audit-tabs/quality-tab"
import { cn } from "@/lib/utils"
import type { User } from "@supabase/supabase-js"
import type { Workspace } from "@/lib/storage-manager"

interface AuditTabProps {
    user: User
    selectedProject: Workspace | null
}

export function AuditTab({ user, selectedProject }: AuditTabProps) {
    const [activeAuditTab, setActiveAuditTab] = useState<"docs" | "review" | "quality">("docs")
    const [showFileExplorer, setShowFileExplorer] = useState(true)
    const [selectedDocPath, setSelectedDocPath] = useState<string>("")
    const [selectedReviewPath, setSelectedReviewPath] = useState<string>("")
    const [selectedQualityPath, setSelectedQualityPath] = useState<string>("")
    const isMobile = useIsMobile()

    return (
        <div className="flex flex-col h-full overflow-hidden relative bg-gray-950">
            {/* Audit Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-700/60 bg-gray-900/80">
                <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-200">Audit Tools</span>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* File Explorer Sidebar - Toggleable overlay for both mobile and PC */}
                {showFileExplorer && (
                    <div className={cn(
                        "border-r border-gray-700/60 overflow-y-auto bg-gray-950",
                        isMobile
                            ? "absolute inset-y-0 left-0 w-80 shadow-lg z-20 border-r"
                            : "w-80 flex-shrink-0"
                    )}>
                        <div className="p-4">
                            {/* Tab Switcher in Sidebar */}
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="font-semibold text-gray-200">Audit Files</h2>
                                <button
                                    type="button"
                                    onClick={() => setShowFileExplorer(false)}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                                    title="Hide file explorer"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>

                            {/* Custom Tab Buttons */}
                            <div className="flex flex-col gap-1 mb-6">
                                <button
                                    type="button"
                                    onClick={() => setActiveAuditTab("docs")}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                                        activeAuditTab === "docs"
                                            ? "bg-orange-600/15 text-orange-400"
                                            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                                    }`}
                                >
                                    <FileText className="h-4 w-4" />
                                    <span>Documentation</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAuditTab("review")}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                                        activeAuditTab === "review"
                                            ? "bg-orange-600/15 text-orange-400"
                                            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                                    }`}
                                >
                                    <Search className="h-4 w-4" />
                                    <span>Code Review</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAuditTab("quality")}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                                        activeAuditTab === "quality"
                                            ? "bg-orange-600/15 text-orange-400"
                                            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                                    }`}
                                >
                                    <CheckCircle className="h-4 w-4" />
                                    <span>Quality</span>
                                </button>
                            </div>

                            {/* Sidebar Content */}
                            {activeAuditTab === "docs" && (
                                <DocsTab
                                    user={user}
                                    selectedProject={selectedProject}
                                    isSidebar={true}
                                    onToggleExplorer={() => setShowFileExplorer(!showFileExplorer)}
                                    showExplorer={showFileExplorer}
                                    selectedDocPath={selectedDocPath}
                                    onSelectDoc={setSelectedDocPath}
                                />
                            )}
                            {activeAuditTab === "review" && (
                                <ReviewTab
                                    user={user}
                                    selectedProject={selectedProject}
                                    isSidebar={true}
                                    onToggleExplorer={() => setShowFileExplorer(!showFileExplorer)}
                                    showExplorer={showFileExplorer}
                                    selectedReviewPath={selectedReviewPath}
                                    onSelectReview={setSelectedReviewPath}
                                />
                            )}
                            {activeAuditTab === "quality" && (
                                <QualityTab
                                    user={user}
                                    selectedProject={selectedProject}
                                    isSidebar={true}
                                    onToggleExplorer={() => setShowFileExplorer(!showFileExplorer)}
                                    showExplorer={showFileExplorer}
                                    selectedQualityPath={selectedQualityPath}
                                    onSelectQuality={setSelectedQualityPath}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* Mobile Overlay - Click to close */}
                {isMobile && showFileExplorer && (
                    <div
                        className="absolute inset-0 bg-black/50 z-10"
                        onClick={() => setShowFileExplorer(false)}
                    />
                )}

                {/* Main Content Area */}
                <div className={cn(
                    "flex-1 overflow-y-auto",
                    isMobile ? "pt-4 pb-20" : ""
                )}>
                    {/* File Explorer Toggle Button - Only show when explorer is closed */}
                    {!showFileExplorer && (
                        <div className="sticky top-4 left-4 z-10 self-start mb-4">
                            <button
                                type="button"
                                onClick={() => setShowFileExplorer(true)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors shadow-md"
                                title="Show file explorer"
                            >
                                <Menu className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    <Tabs value={activeAuditTab} className="h-full">
                        <TabsContent value="docs" className="h-full m-0">
                            <DocsTab
                                user={user}
                                selectedProject={selectedProject}
                                isSidebar={false}
                                onToggleExplorer={() => setShowFileExplorer(!showFileExplorer)}
                                showExplorer={showFileExplorer}
                                selectedDocPath={selectedDocPath}
                                onSelectDoc={setSelectedDocPath}
                            />
                        </TabsContent>
                        <TabsContent value="review" className="h-full m-0">
                            <ReviewTab
                                user={user}
                                selectedProject={selectedProject}
                                isSidebar={false}
                                onToggleExplorer={() => setShowFileExplorer(!showFileExplorer)}
                                showExplorer={showFileExplorer}
                                selectedReviewPath={selectedReviewPath}
                                onSelectReview={setSelectedReviewPath}
                            />
                        </TabsContent>
                        <TabsContent value="quality" className="h-full m-0">
                            <QualityTab
                                user={user}
                                selectedProject={selectedProject}
                                isSidebar={false}
                                onToggleExplorer={() => setShowFileExplorer(!showFileExplorer)}
                                showExplorer={showFileExplorer}
                                selectedQualityPath={selectedQualityPath}
                                onSelectQuality={setSelectedQualityPath}
                            />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    )
}
