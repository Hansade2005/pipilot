"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import {
  Search,
  FileCode,
  X,
  ChevronDown,
  ChevronRight,
  Replace,
  Check,
  Loader2,
  ExternalLink,
  CaseSensitive,
  Regex,
  WholeWord,
  Filter,
  ChevronUp,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: string
  filePath: string
  fileName: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

interface FileResults {
  filePath: string
  fileName: string
  results: SearchResult[]
  isExpanded: boolean
}

interface ActivitySearchPanelProps {
  projectId: string | null
  onOpenFile?: (filePath: string, lineNumber?: number) => void
}

export function ActivitySearchPanel({ projectId, onOpenFile }: ActivitySearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [replaceQuery, setReplaceQuery] = useState("")
  const [showReplace, setShowReplace] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [results, setResults] = useState<FileResults[]>([])
  const [totalMatches, setTotalMatches] = useState(0)

  // Search options
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [includePattern, setIncludePattern] = useState("")
  const [excludePattern, setExcludePattern] = useState("node_modules,dist,.git,.next")

  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Build regex from search query
  const buildSearchRegex = useCallback((query: string): RegExp | null => {
    if (!query.trim()) return null
    try {
      let pattern = query
      if (!useRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`
      }
      const flags = caseSensitive ? 'g' : 'gi'
      return new RegExp(pattern, flags)
    } catch {
      return null
    }
  }, [caseSensitive, useRegex, wholeWord])

  // File filter
  const shouldIncludeFile = useCallback((filePath: string): boolean => {
    if (excludePattern) {
      const excludes = excludePattern.split(',').map(p => p.trim()).filter(Boolean)
      for (const exclude of excludes) {
        if (filePath.includes(exclude)) return false
      }
    }
    if (includePattern) {
      const includes = includePattern.split(',').map(p => p.trim()).filter(Boolean)
      let matches = false
      for (const include of includes) {
        if (include.startsWith('*.')) {
          if (filePath.endsWith(include.slice(1))) matches = true
        } else if (filePath.includes(include)) {
          matches = true
        }
      }
      return matches
    }
    return true
  }, [includePattern, excludePattern])

  // Perform search
  const performSearch = useCallback(async () => {
    if (!projectId || !searchQuery.trim()) {
      setResults([])
      setTotalMatches(0)
      return
    }

    const regex = buildSearchRegex(searchQuery)
    if (!regex) return

    setIsSearching(true)
    setResults([])
    setTotalMatches(0)

    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const files = await storageManager.getFiles(projectId)
      const fileResults: FileResults[] = []
      let totalCount = 0

      for (const file of files) {
        if (file.isDirectory || !file.content) continue
        if (!shouldIncludeFile(file.path)) continue

        const lines = file.content.split('\n')
        const searchResults: SearchResult[] = []

        lines.forEach((line, index) => {
          regex.lastIndex = 0
          let match
          while ((match = regex.exec(line)) !== null) {
            searchResults.push({
              id: `${file.path}-${index}-${match.index}`,
              filePath: file.path,
              fileName: file.path.split('/').pop() || file.path,
              lineNumber: index + 1,
              lineContent: line,
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            })
            totalCount++
            if (match[0].length === 0) regex.lastIndex++
          }
        })

        if (searchResults.length > 0) {
          fileResults.push({
            filePath: file.path,
            fileName: file.path.split('/').pop() || file.path,
            results: searchResults,
            isExpanded: fileResults.length < 10,
          })
        }
      }

      setResults(fileResults)
      setTotalMatches(totalCount)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }, [projectId, searchQuery, buildSearchRegex, shouldIncludeFile])

  // Auto-search with debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (searchQuery.trim()) {
      searchTimerRef.current = setTimeout(() => {
        performSearch()
      }, 400)
    } else {
      setResults([])
      setTotalMatches(0)
    }
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery, caseSensitive, useRegex, wholeWord, includePattern, excludePattern])

  // Replace in single file
  const replaceInFile = useCallback(async (filePath: string) => {
    if (!projectId || !searchQuery.trim()) return
    const regex = buildSearchRegex(searchQuery)
    if (!regex) return

    setIsReplacing(true)
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const files = await storageManager.getFiles(projectId)
      const file = files.find(f => f.path === filePath)
      if (!file?.content) return

      regex.lastIndex = 0
      const newContent = file.content.replace(regex, replaceQuery)
      await storageManager.updateFile(projectId, filePath, {
        content: newContent,
        updatedAt: new Date().toISOString()
      })

      window.dispatchEvent(new CustomEvent('files-changed', {
        detail: { projectId, forceRefresh: true }
      }))

      // Re-search to update results
      performSearch()
    } catch (error) {
      console.error('Replace error:', error)
    } finally {
      setIsReplacing(false)
    }
  }, [projectId, searchQuery, replaceQuery, buildSearchRegex, performSearch])

  // Replace all across all files
  const replaceAll = useCallback(async () => {
    if (!projectId || !searchQuery.trim()) return
    const regex = buildSearchRegex(searchQuery)
    if (!regex) return

    setIsReplacing(true)
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const files = await storageManager.getFiles(projectId)
      let replacedFiles = 0

      for (const file of files) {
        if (file.isDirectory || !file.content) continue
        if (!shouldIncludeFile(file.path)) continue

        regex.lastIndex = 0
        const matches = file.content.match(regex)
        if (matches && matches.length > 0) {
          regex.lastIndex = 0
          const newContent = file.content.replace(regex, replaceQuery)
          await storageManager.updateFile(projectId, file.path, {
            content: newContent,
            updatedAt: new Date().toISOString()
          })
          replacedFiles++
        }
      }

      window.dispatchEvent(new CustomEvent('files-changed', {
        detail: { projectId, forceRefresh: true }
      }))

      performSearch()
    } catch (error) {
      console.error('Replace all error:', error)
    } finally {
      setIsReplacing(false)
    }
  }, [projectId, searchQuery, replaceQuery, buildSearchRegex, shouldIncludeFile, performSearch])

  // Toggle file expansion
  const toggleFileExpansion = (filePath: string) => {
    setResults(prev => prev.map(f =>
      f.filePath === filePath ? { ...f, isExpanded: !f.isExpanded } : f
    ))
  }

  // Highlight match
  const highlightMatch = (line: string, start: number, end: number) => (
    <span className="font-mono text-[11px] leading-tight">
      <span className="text-gray-500">{line.slice(0, start)}</span>
      <span className="bg-orange-500/30 text-orange-200 rounded-sm">{line.slice(start, end)}</span>
      <span className="text-gray-500">{line.slice(end)}</span>
    </span>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Search</h3>
        <button
          onClick={() => setShowReplace(!showReplace)}
          className={cn(
            "p-1 rounded transition-colors",
            showReplace ? "text-orange-400 bg-orange-500/10" : "text-gray-500 hover:text-gray-300"
          )}
          title="Toggle Replace"
        >
          <Replace className="size-3.5" />
        </button>
      </div>

      {/* Search & Replace Inputs */}
      <div className="px-3 pt-3 pb-2 space-y-2 flex-shrink-0">
        {/* Search Input Row */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') performSearch()
              }}
              placeholder="Search"
              className="w-full h-[26px] px-2 bg-gray-900/80 border border-gray-700/60 rounded text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-orange-500/50 font-mono"
            />
            {isSearching && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-orange-400 animate-spin" />
            )}
          </div>

          {/* Option Buttons */}
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={cn(
              "w-[26px] h-[26px] flex items-center justify-center rounded text-[10px] font-bold transition-colors flex-shrink-0",
              caseSensitive ? "bg-orange-500/20 text-orange-400 border border-orange-500/40" : "text-gray-500 hover:text-gray-300 border border-transparent"
            )}
            title="Match Case"
          >
            Aa
          </button>
          <button
            onClick={() => setWholeWord(!wholeWord)}
            className={cn(
              "w-[26px] h-[26px] flex items-center justify-center rounded text-[10px] font-bold transition-colors flex-shrink-0",
              wholeWord ? "bg-orange-500/20 text-orange-400 border border-orange-500/40" : "text-gray-500 hover:text-gray-300 border border-transparent"
            )}
            title="Match Whole Word"
          >
            ab
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={cn(
              "w-[26px] h-[26px] flex items-center justify-center rounded text-[10px] font-bold transition-colors flex-shrink-0",
              useRegex ? "bg-orange-500/20 text-orange-400 border border-orange-500/40" : "text-gray-500 hover:text-gray-300 border border-transparent"
            )}
            title="Use Regular Expression"
          >
            .*
          </button>
        </div>

        {/* Replace Input Row */}
        {showReplace && (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace"
              className="flex-1 h-[26px] px-2 bg-gray-900/80 border border-gray-700/60 rounded text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-orange-500/50 font-mono"
            />
            <button
              onClick={replaceAll}
              disabled={isReplacing || !searchQuery.trim() || totalMatches === 0}
              className="h-[26px] px-2 flex items-center gap-1 rounded text-[10px] text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0 border border-transparent"
              title="Replace All"
            >
              {isReplacing ? <Loader2 className="size-3 animate-spin" /> : <span className="font-bold">AB</span>}
            </button>
          </div>
        )}

        {/* Filters Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {showFilters ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <Filter className="size-3" />
          <span>files to include/exclude</span>
        </button>

        {showFilters && (
          <div className="space-y-1.5">
            <input
              type="text"
              value={includePattern}
              onChange={(e) => setIncludePattern(e.target.value)}
              placeholder="files to include (e.g. *.tsx, src)"
              className="w-full h-[24px] px-2 bg-gray-900/80 border border-gray-700/60 rounded text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-orange-500/50"
            />
            <input
              type="text"
              value={excludePattern}
              onChange={(e) => setExcludePattern(e.target.value)}
              placeholder="files to exclude"
              className="w-full h-[24px] px-2 bg-gray-900/80 border border-gray-700/60 rounded text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-orange-500/50"
            />
          </div>
        )}
      </div>

      {/* Results Summary */}
      {totalMatches > 0 && (
        <div className="px-3 pb-1.5 flex items-center justify-between text-[11px] text-gray-500 flex-shrink-0">
          <span>
            <span className="text-gray-300">{totalMatches}</span> results in <span className="text-gray-300">{results.length}</span> files
          </span>
          <button onClick={performSearch} className="text-gray-500 hover:text-gray-300 transition-colors" title="Refresh">
            <RefreshCw className="size-3" />
          </button>
        </div>
      )}

      {/* Results Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {results.length === 0 && !isSearching && searchQuery.trim() === '' && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600">
            <Search className="size-8 mb-2 opacity-20" />
            <p className="text-[11px]">Type to search across files</p>
          </div>
        )}

        {results.length === 0 && !isSearching && searchQuery.trim() !== '' && (
          <div className="flex flex-col items-center justify-center h-20 text-gray-600">
            <p className="text-[11px]">No results found</p>
          </div>
        )}

        {results.map((fileResult) => (
          <div key={fileResult.filePath}>
            {/* File Header */}
            <button
              onClick={() => toggleFileExpansion(fileResult.filePath)}
              className="w-full flex items-center gap-1.5 px-3 py-1 hover:bg-gray-800/40 transition-colors text-left group"
            >
              {fileResult.isExpanded ? (
                <ChevronDown className="size-3 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="size-3 text-gray-500 flex-shrink-0" />
              )}
              <FileCode className="size-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-[11px] text-gray-300 truncate flex-1 min-w-0">{fileResult.fileName}</span>
              <span className="text-[10px] text-gray-600 flex-shrink-0 bg-gray-800 px-1.5 rounded">{fileResult.results.length}</span>
              {showReplace && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    replaceInFile(fileResult.filePath)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-orange-400 transition-all flex-shrink-0"
                  title="Replace in this file"
                >
                  <Replace className="size-3" />
                </button>
              )}
            </button>

            {/* File Path */}
            {fileResult.isExpanded && (
              <div className="px-3 pl-8 pb-0.5">
                <span className="text-[10px] text-gray-600 truncate block">{fileResult.filePath}</span>
              </div>
            )}

            {/* Results */}
            {fileResult.isExpanded && fileResult.results.map((result) => (
              <button
                key={result.id}
                onClick={() => onOpenFile?.(result.filePath, result.lineNumber)}
                className="w-full flex items-start gap-2 px-3 pl-8 py-0.5 hover:bg-gray-800/30 transition-colors text-left group/item"
              >
                <span className="text-[10px] text-gray-600 w-6 text-right flex-shrink-0 pt-px font-mono">
                  {result.lineNumber}
                </span>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <code className="whitespace-pre-wrap break-all block leading-tight">
                    {highlightMatch(result.lineContent.trim(),
                      result.matchStart - (result.lineContent.length - result.lineContent.trimStart().length > 0 ? result.lineContent.length - result.lineContent.trimStart().length : 0),
                      result.matchEnd - (result.lineContent.length - result.lineContent.trimStart().length > 0 ? result.lineContent.length - result.lineContent.trimStart().length : 0)
                    )}
                  </code>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
