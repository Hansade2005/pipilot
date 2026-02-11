"use client"

import React, { useState, useEffect } from "react"
import { useToast } from '@/hooks/use-toast'
import { useAutoCloudBackup } from '@/hooks/use-auto-cloud-backup'

// Type declaration for JSZip
declare global {
  interface Window {
    JSZip?: any
  }
}

// Load JSZip from CDN
if (typeof window !== 'undefined' && !window.JSZip) {
  const script = document.createElement('script')
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  script.async = true
  document.head.appendChild(script)
}
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Folder,
  FolderOpen,
  FileText,
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  FileCode,
  FileImage,
  FileJson,
  FileType,
  Settings,
  Package,
  FileDown,
  File,
  Upload,
  Download,
  Archive
} from "lucide-react"
import type { Workspace as Project, File as FileItem } from "@/lib/storage-manager"
import { dbManager } from '@/lib/indexeddb';

interface FileExplorerProps {
  project: Project | null
  onFileSelect: (file: FileItem | null) => void
  selectedFile: FileItem | null
}

interface FileNode {
  name: string
  path: string
  type: "file" | "folder"
  file?: FileItem
  children: FileNode[]
  expanded?: boolean
}

export function FileExplorer({ project, onFileSelect, selectedFile }: FileExplorerProps) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newFileName, setNewFileName] = useState("")
  const [newFileType, setNewFileType] = useState("tsx")
  const [isCreating, setIsCreating] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  // Track folder for new file creation
  const [createInFolder, setCreateInFolder] = useState<string | null>(null)
  // Drag target for visual highlight
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  // File upload states
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadInFolder, setUploadInFolder] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const { toast } = useToast()
  
  // Auto cloud backup functionality
  const { triggerAutoBackup, forceBackup } = useAutoCloudBackup({
    debounceMs: 3000, // Wait 3 seconds after last change
    silent: false // Show backup notifications
  })

  // Drag-and-drop logic
  const handleDragStart = (e: React.DragEvent, node: FileNode) => {
    e.dataTransfer.setData("text/plain", node.path)
  }
  const handleDrop = async (e: React.DragEvent, folderNode: FileNode) => {
    e.preventDefault()
    setDragOverFolder(null)
    
    // Check if files are being dropped (upload)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleDropUpload(e, folderNode.type === "folder" ? folderNode.path : null)
      return
    }
    
    // Otherwise, handle file moving
    const filePath = e.dataTransfer.getData("text/plain")
    if (!project || !filePath || folderNode.type !== "folder") return
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const file = files.find(f => f.path === filePath)
      if (!file) return
      const newPath = `${folderNode.path}/${file.name}`
      await storageManager.updateFile(project.id, filePath, { path: newPath })
      await fetchFiles()
      
      // Trigger auto cloud backup after file move
      triggerAutoBackup(`Moved file: ${file.name} to ${folderNode.path}`)
      
      toast({ title: 'Moved file', description: `Moved ${file.name} to ${folderNode.path}` })
    } catch (error) {
      console.error("Error moving file:", error)
    }
  }

  const handleRenameFile = async () => {
    if (!project || !renamingFile || !renameValue.trim()) return
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const file = files.find(f => f.path === renamingFile)
      if (!file) return
      const newPath = renamingFile.split('/').slice(0, -1).concat(renameValue).join('/')
      await storageManager.updateFile(project.id, renamingFile, { name: renameValue, path: newPath })
      setRenamingFile(null)
      setRenameValue("")
      await fetchFiles()
      
      // Trigger auto cloud backup after rename
      triggerAutoBackup(`Renamed file: ${file.name} → ${renameValue}`)
      
      toast({ title: 'Renamed file', description: `Renamed ${file.name} → ${renameValue}` })
    } catch (error) {
      console.error("Error renaming file:", error)
    }
  }

  useEffect(() => {
    console.log('🔄 FileExplorer: Project prop changed:', project?.id, project?.name)
    if (project) {
      console.log('🔄 FileExplorer: Fetching files for project:', project.id, '- useEffect triggered by project prop change')
      fetchFiles()
    } else {
      console.log('🔄 FileExplorer: No project selected, clearing files')
      setFiles([])
    }
  }, [project])

  useEffect(() => {
    setFileTree(buildFileTree(files))
  }, [files, expandedFolders])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n':
            e.preventDefault()
            setIsCreateDialogOpen(true)
            break
          case 'f':
            e.preventDefault()
            setShowSearch(true)
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  // Listen for file change events from other components (e.g., chat-panel)
  useEffect(() => {
    if (!project) return;
    
    const handleFilesChanged = (e: CustomEvent) => {
      const detail = e.detail as { projectId: string };
      if (detail.projectId === project.id) {
        console.log('🔔 File explorer: Detected "files-changed" event for project:', project.id, '- triggering refresh at', new Date().toISOString());
        fetchFiles();
      } else {
        console.log('🔕 File explorer: Ignoring "files-changed" event for different project:', detail.projectId, '(current project:', project.id, ')');
      }
    };
    
    window.addEventListener('files-changed', handleFilesChanged as EventListener);
    return () => window.removeEventListener('files-changed', handleFilesChanged as EventListener);
  }, [project]);

  const fetchFiles = async () => {
    if (!project) {
      console.log('FileExplorer: No project provided to fetchFiles')
      return;
    }

    try {
      console.log(`📂 FileExplorer: Fetching files for project: ${project.id} (${project.name}) from IndexedDB - Timestamp: ${new Date().toISOString()}`);

      // Import and initialize storage manager
      const { storageManager } = await import('@/lib/storage-manager');
      await storageManager.init();

      // Get files directly from IndexedDB
      const projectFiles = await storageManager.getFiles(project.id);
      console.log(`✅ FileExplorer: Found ${projectFiles.length} files for project: ${project.id}`);

      // Verify all files belong to correct workspace
      const incorrectFiles = projectFiles.filter(f => f.workspaceId !== project.id);
      if (incorrectFiles.length > 0) {
        console.error(`🚨 CONTAMINATION DETECTED in FileExplorer: ${incorrectFiles.length} files belong to wrong workspace!`, incorrectFiles.map(f => ({ name: f.name, path: f.path, actualWorkspaceId: f.workspaceId, expectedWorkspaceId: project.id })));
      } else {
        console.log(`✅ All ${projectFiles.length} files verified to belong to workspace: ${project.id}`);
      }

      if (projectFiles.length === 0) {
        console.log('⚠️ FileExplorer: No files found for project, this might indicate template application failed')
      } else {
        console.log('📄 FileExplorer: Sample files:', projectFiles.slice(0, 5).map(f => ({ name: f.name, path: f.path, workspaceId: f.workspaceId })))
      }

      setFiles(projectFiles);
      // If no files, show empty state in UI (handled by render logic)
    } catch (error) {
      console.error('❌ FileExplorer: Error fetching files:', error);
    }
  }

  const buildFileTree = (files: FileItem[]): FileNode[] => {
    const tree: FileNode[] = []
    const folderMap = new Map<string, FileNode>()

    // First, create all directory entries from files marked as isDirectory: true
    files.forEach((file) => {
      if (file.isDirectory) {
        const folderNode: FileNode = {
          name: file.name,
          path: file.path,
          type: "folder",
          file,
          children: [],
          expanded: expandedFolders.has(file.path),
        }
        folderMap.set(file.path, folderNode)
      }
    })

    // Create folder structure from file paths and handle actual files
    files.forEach((file) => {
      // Skip files that are directories (already handled above)
      if (file.isDirectory) {
        return
      }

      const pathParts = file.path.split("/").filter(Boolean)
      let currentPath = ""

      pathParts.forEach((part, index) => {
        const isFile = index === pathParts.length - 1
        currentPath = currentPath ? `${currentPath}/${part}` : part

        if (isFile) {
          // Add file to its parent folder or root
          const parentPath = pathParts.slice(0, -1).join("/")
          const parent = parentPath ? folderMap.get(parentPath) : null

          const fileNode: FileNode = {
            name: part,
            path: currentPath,
            type: "file",
            file,
            children: [],
          }

          if (parent) {
            parent.children.push(fileNode)
          } else {
            tree.push(fileNode)
          }
        } else {
          // Create implicit folder if it doesn't exist (for nested file paths)
          if (!folderMap.has(currentPath)) {
            const folderNode: FileNode = {
              name: part,
              path: currentPath,
              type: "folder",
              children: [],
              expanded: expandedFolders.has(currentPath),
            }

            folderMap.set(currentPath, folderNode)
          }
        }
      })
    })

    // Now arrange all folders and files in the tree structure
    const allNodes = Array.from(folderMap.values())
    
    // Add folders to their parents or root
    allNodes.forEach((node) => {
      const parentPath = node.path.split("/").slice(0, -1).join("/")
      const parent = parentPath ? folderMap.get(parentPath) : null
      
      if (parent) {
        parent.children.push(node)
      } else {
        tree.push(node)
      }
    })

    // Sort each level: folders first, then files, both alphabetically
    const sortNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.sort((a, b) => {
        if (a.type === "folder" && b.type === "file") return -1
        if (a.type === "file" && b.type === "folder") return 1
        return a.name.localeCompare(b.name)
      })
    }

    const sortTree = (nodes: FileNode[]): FileNode[] => {
      const sorted = sortNodes(nodes)
      sorted.forEach(node => {
        if (node.children.length > 0) {
          node.children = sortTree(node.children)
        }
      })
      return sorted
    }

    return sortTree(tree)
  }

  // Helper function to generate CSS filter colors
  const getColorFilter = (color: string) => {
    const colorMap: { [key: string]: string } = {
      'blue': 'invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)',
      'yellow': 'invert(69%) sepia(100%) saturate(7500%) hue-rotate(346deg) brightness(102%) contrast(107%)',
      'green': 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(346deg) brightness(118%) contrast(119%)',
      'orange': 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(346deg) brightness(118%) contrast(119%)',
      'pink': 'invert(50%) sepia(79%) saturate(2476%) hue-rotate(346deg) brightness(118%) contrast(119%)',
      'purple': 'invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)',
      'red': 'invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)',
      'cyan': 'invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)',
      'gray': 'invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)'
    }
    return colorMap[color] || colorMap['gray']
  }

  // Component for Simple Icon with fallback
  const SimpleIconWithFallback = ({ iconName, fallbackIcon, color }: { iconName: string, fallbackIcon: React.ReactNode, color: string }) => {
    const [imageError, setImageError] = useState(false)
    
    if (imageError) {
      return <>{fallbackIcon}</>
    }
    
    return (
      <img 
        src={`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${iconName}.svg`}
        alt={iconName}
        className="h-4 w-4"
        style={{ filter: getColorFilter(color) }}
        onError={() => setImageError(true)}
      />
    )
  }

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase()
    
    // Map file extensions to Simple Icons
    const getSimpleIcon = (iconName: string, fallbackIcon: React.ReactNode, color: string) => {
      return <SimpleIconWithFallback iconName={iconName} fallbackIcon={fallbackIcon} color={color} />
    }
    
    switch (extension) {
      case 'tsx':
      case 'jsx':
        return getSimpleIcon('react', <FileCode className="h-4 w-4 text-blue-500" />, 'blue')
      case 'ts':
        return getSimpleIcon('typescript', <FileType className="h-4 w-4 text-blue-500" />, 'blue')
      case 'js':
        return getSimpleIcon('javascript', <FileType className="h-4 w-4 text-yellow-500" />, 'yellow')
      case 'css':
        return getSimpleIcon('css3', <File className="h-4 w-4 text-blue-500" />, 'blue')
      case 'scss':
      case 'sass':
        return getSimpleIcon('sass', <File className="h-4 w-4 text-pink-500" />, 'pink')
      case 'html':
        return getSimpleIcon('html5', <FileText className="h-4 w-4 text-orange-600" />, 'orange')
      case 'json':
        return getSimpleIcon('json', <FileJson className="h-4 w-4 text-green-500" />, 'green')
      case 'md':
        return getSimpleIcon('markdown', <FileDown className="h-4 w-4 text-purple-500" />, 'purple')
      case 'xml':
        return getSimpleIcon('xml', <FileText className="h-4 w-4 text-blue-600" />, 'blue')
      case 'yml':
      case 'yaml':
        return getSimpleIcon('yaml', <Settings className="h-4 w-4 text-indigo-500" />, 'purple')
      case 'env':
        return <Settings className="h-4 w-4 text-green-600" />
      case 'gitignore':
        return getSimpleIcon('git', <FileText className="h-4 w-4 text-gray-600" />, 'gray')
      case 'py':
        return getSimpleIcon('python', <FileCode className="h-4 w-4 text-blue-600" />, 'blue')
      case 'java':
        return getSimpleIcon('java', <FileCode className="h-4 w-4 text-red-600" />, 'red')
      case 'cpp':
      case 'c':
        return getSimpleIcon('cplusplus', <FileCode className="h-4 w-4 text-blue-700" />, 'blue')
      case 'php':
        return getSimpleIcon('php', <FileCode className="h-4 w-4 text-purple-600" />, 'purple')
      case 'rb':
        return getSimpleIcon('ruby', <FileCode className="h-4 w-4 text-red-500" />, 'red')
      case 'go':
        return getSimpleIcon('go', <FileCode className="h-4 w-4 text-cyan-600" />, 'cyan')
      case 'rs':
        return getSimpleIcon('rust', <FileCode className="h-4 w-4 text-orange-700" />, 'orange')
      case 'sh':
      case 'bat':
      case 'ps1':
        return getSimpleIcon('bash', <FileCode className="h-4 w-4 text-green-700" />, 'green')
      case 'sql':
        return getSimpleIcon('mysql', <FileText className="h-4 w-4 text-blue-800" />, 'blue')
      case 'txt':
      case 'log':
        return <FileText className="h-4 w-4 text-gray-500" />
      case 'conf':
      case 'ini':
      case 'toml':
        return <Settings className="h-4 w-4 text-amber-600" />
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return <FileImage className="h-4 w-4 text-orange-500" />
      case 'svg':
        return getSimpleIcon('svg', <FileImage className="h-4 w-4 text-orange-500" />, 'orange')
      default:
        if (fileName === 'package.json') {
          return getSimpleIcon('npm', <Package className="h-4 w-4 text-red-500" />, 'red')
        }
        if (fileName === 'yarn.lock') {
          return getSimpleIcon('yarn', <Package className="h-4 w-4 text-blue-500" />, 'blue')
        }
        if (fileName === 'pnpm-lock.yaml') {
          return getSimpleIcon('pnpm', <Package className="h-4 w-4 text-orange-500" />, 'orange')
        }
        if (fileName === 'Dockerfile') {
          return getSimpleIcon('docker', <FileCode className="h-4 w-4 text-blue-500" />, 'blue')
        }
        if (fileName === 'docker-compose.yml') {
          return getSimpleIcon('docker', <FileCode className="h-4 w-4 text-blue-500" />, 'blue')
        }
        return <FileText className="h-4 w-4 text-gray-500" />
    }
  }

  const getFileName = (inputName: string, fileType: string): string => {
    // Handle special cases where the filename should be different
    switch (fileType) {
      case "env":
        return inputName.startsWith('.env') ? inputName : `.env${inputName ? '.' + inputName : ''}`
      case "gitignore":
        return ".gitignore"
      case "folder":
        return inputName
      default:
        return `${inputName}.${fileType}`
    }
  }

  const handleCreateFile = async () => {
    if (!project || !newFileName.trim()) return

    setIsCreating(true)
    try {
      // Use helper function to get the correct filename
      const fileName = getFileName(newFileName, newFileType)
      const filePath = createInFolder ? `${createInFolder}/${fileName}` : fileName

      // Import and initialize storage manager
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      
      // Create file directly in IndexedDB
      const newFile = await storageManager.createFile({
        workspaceId: project.id,
        name: fileName,
        path: filePath,
        content: newFileType === "folder" ? "" : getDefaultContent(newFileType),
        fileType: newFileType === "folder" ? "folder" : "text",
        type: newFileType === "folder" ? "folder" : "text",
        size: (newFileType === "folder" ? "" : getDefaultContent(newFileType)).length,
        isDirectory: newFileType === "folder"
      })

      if (newFile) {
        console.log('File created successfully:', newFile)
        await fetchFiles()
        setIsCreateDialogOpen(false)
        setNewFileName("")
        setNewFileType("tsx")
        setCreateInFolder(null)
        
        // Auto-expand the folder if it was created
        if (newFileType === "folder") {
          const newExpanded = new Set(expandedFolders)
          newExpanded.add(filePath)
          setExpandedFolders(newExpanded)
        }
        
        // Trigger auto cloud backup after file creation
        triggerAutoBackup(`Created ${newFileType === "folder" ? "folder" : "file"}: ${fileName}`)
        
        toast({
          title: "Success",
          description: `${newFileType === "folder" ? "Folder" : "File"} created successfully!`
        })
      }
    } catch (error) {
      console.error("Error creating file in IndexedDB:", error)
      toast({
        title: "Error",
        description: `Failed to create ${newFileType === "folder" ? "folder" : "file"}`,
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  const getDefaultContent = (fileType: string): string => {
    const componentName = newFileName.charAt(0).toUpperCase() + newFileName.slice(1)
    
    switch (fileType) {
      case "tsx":
        return `import React from 'react'

export default function ${componentName}() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">${componentName}</h1>
      <p>This is a new React component.</p>
    </div>
  )
}`
      case "jsx":
        return `import React from 'react'

export default function ${componentName}() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">${componentName}</h1>
      <p>This is a new React component.</p>
    </div>
  )
}`
      case "ts":
        return `// ${componentName} utility
export const ${newFileName} = () => {
  console.log('${newFileName} function called')
  return null
}

export type ${componentName}Type = {
  id: string
  name: string
}`
      case "js":
        return `// ${componentName} utility
export const ${newFileName} = () => {
  console.log('${newFileName} function called')
  return null
}`
      case "css":
        return `/* ${componentName} styles */
.${newFileName} {
  display: flex;
  align-items: center;
  justify-content: center;
}

.${newFileName}__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}`
      case "scss":
      case "sass":
        return `// ${componentName} styles
$primary-color: #007bff;
$secondary-color: #6c757d;

.${newFileName} {
  display: flex;
  align-items: center;
  justify-content: center;
  
  &__container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  &__title {
    color: $primary-color;
    font-size: 2rem;
  }
}`
      case "html":
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${componentName}</title>
</head>
<body>
    <h1>${componentName}</h1>
    <p>This is a new HTML file.</p>
</body>
</html>`
      case "json":
        return `{
  "name": "${newFileName}",
  "version": "1.0.0",
  "description": "${componentName} configuration",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "keywords": [],
  "author": "",
  "license": "MIT"
}`
      case "md":
        return `# ${componentName}

This is a markdown file for documentation.

## Description

${componentName} provides functionality for...

## Usage

\`\`\`typescript
// Example usage
import { ${newFileName} } from './${newFileName}'

const result = ${newFileName}()
\`\`\`

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

\`\`\`bash
npm install
\`\`\`

## Contributing

Pull requests are welcome. For major changes, please open an issue first.`
      case "xml":
        return `<?xml version="1.0" encoding="UTF-8"?>
<root>
    <${newFileName}>
        <name>${componentName}</name>
        <description>This is a new XML file</description>
    </${newFileName}>
</root>`
      case "yml":
      case "yaml":
        return `# ${componentName} configuration
name: ${newFileName}
version: 1.0.0
description: ${componentName} configuration file

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development

networks:
  default:
    driver: bridge`
      case "env":
        return `# ${componentName} Environment Variables
# Copy this file to .env.local and fill in your values

# Database
DATABASE_URL=

# Authentication
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# API Keys
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=`
      case "gitignore":
        return `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Production
build/
dist/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db`
      case "py":
        return `#!/usr/bin/env python3
"""${componentName} module.

This module provides functionality for...
"""

def ${newFileName}():
    """Main function for ${newFileName}."""
    print(f"Hello from ${newFileName}!")
    pass

def main():
    """Entry point."""
    ${newFileName}()

if __name__ == "__main__":
    main()`
      case "java":
        return `public class ${componentName} {
    
    public static void main(String[] args) {
        System.out.println("Hello from ${componentName}!");
    }
    
    public void ${newFileName}() {
        // TODO: Implement ${newFileName} functionality
    }
}`
      case "cpp":
        return `#include <iostream>
#include <string>

class ${componentName} {
public:
    ${componentName}() {}
    
    void ${newFileName}() {
        std::cout << "Hello from ${componentName}!" << std::endl;
    }
};

int main() {
    ${componentName} obj;
    obj.${newFileName}();
    return 0;
}`
      case "c":
        return `#include <stdio.h>
#include <stdlib.h>

void ${newFileName}() {
    printf("Hello from ${newFileName}!\\n");
}

int main() {
    ${newFileName}();
    return 0;
}`
      case "php":
        return `<?php
/**
 * ${componentName} class
 * 
 * This class provides functionality for...
 */
class ${componentName} {
    
    public function ${newFileName}() {
        echo "Hello from ${componentName}!";
    }
}

// Usage
$obj = new ${componentName}();
$obj->${newFileName}();
?>`
      case "rb":
        return `#!/usr/bin/env ruby

# ${componentName} class
class ${componentName}
  def initialize
    puts "${componentName} initialized"
  end
  
  def ${newFileName}
    puts "Hello from ${componentName}!"
  end
end

# Usage
obj = ${componentName}.new
obj.${newFileName}`
      case "go":
        return `package main

import (
    "fmt"
)

// ${componentName} struct
type ${componentName} struct {
    Name string
}

// ${newFileName} method
func (c *${componentName}) ${newFileName}() {
    fmt.Printf("Hello from %s!\\n", c.Name)
}

func main() {
    obj := &${componentName}{Name: "${componentName}"}
    obj.${newFileName}()
}`
      case "rs":
        return `// ${componentName} module

struct ${componentName} {
    name: String,
}

impl ${componentName} {
    fn new(name: String) -> Self {
        ${componentName} { name }
    }
    
    fn ${newFileName}(&self) {
        println!("Hello from {}!", self.name);
    }
}

fn main() {
    let obj = ${componentName}::new("${componentName}".to_string());
    obj.${newFileName}();
}`
      case "sh":
        return `#!/bin/bash

# ${componentName} script
# Description: This script provides functionality for...

set -e  # Exit on error

function ${newFileName}() {
    echo "Hello from ${componentName}!"
    # TODO: Add your functionality here
}

function main() {
    echo "Starting ${componentName}..."
    ${newFileName}
    echo "${componentName} completed successfully."
}

# Check if script is being executed directly
if [[ "\${BASH_SOURCE[0]}" == "\${0}" ]]; then
    main "$@"
fi`
      case "bat":
        return `@echo off
REM ${componentName} batch script
REM Description: This script provides functionality for...

setlocal enabledelayedexpansion

echo Starting ${componentName}...

REM TODO: Add your functionality here
echo Hello from ${componentName}!

echo ${componentName} completed successfully.
pause`
      case "ps1":
        return `# ${componentName} PowerShell script
# Description: This script provides functionality for...

function ${componentName} {
    Write-Host "Hello from ${componentName}!" -ForegroundColor Green
    # TODO: Add your functionality here
}

function Main {
    Write-Host "Starting ${componentName}..." -ForegroundColor Yellow
    ${componentName}
    Write-Host "${componentName} completed successfully." -ForegroundColor Green
}

# Execute main function if script is run directly
if ($MyInvocation.InvocationName -ne '.') {
    Main
}`
      case "sql":
        return `-- ${componentName} SQL Script
-- Description: This script provides database functionality for...

-- Create table
CREATE TABLE IF NOT EXISTS ${newFileName} (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO ${newFileName} (name, description) VALUES
('Sample 1', 'This is a sample record'),
('Sample 2', 'This is another sample record');

-- Query data
SELECT * FROM ${newFileName} ORDER BY created_at DESC;`
      case "txt":
        return `${componentName}
${'='.repeat(componentName.length)}

This is a plain text file.

You can add any content here:
- Notes
- Documentation
- Configuration
- Data

Created: ${new Date().toLocaleDateString()}`
      case "log":
        return `[${new Date().toISOString()}] INFO: ${componentName} log file created
[${new Date().toISOString()}] INFO: System initialized successfully
[${new Date().toISOString()}] DEBUG: Debug mode enabled`
      case "conf":
      case "ini":
        return `# ${componentName} Configuration File
# Description: Configuration settings for ${componentName}

[general]
name = ${newFileName}
version = 1.0.0
debug = false

[database]
host = localhost
port = 5432
name = ${newFileName}_db

[api]
baseurl = http://localhost:3000
timeout = 30
retries = 3`
      case "toml":
        return `# ${componentName} TOML Configuration
# Description: Configuration settings for ${componentName}

[package]
name = "${newFileName}"
version = "1.0.0"
description = "${componentName} configuration"

[database]
host = "localhost"
port = 5432
name = "${newFileName}_db"

[api]
base_url = "http://localhost:3000"
timeout = 30
retries = 3

[[features]]
name = "feature1"
enabled = true

[[features]]
name = "feature2"
enabled = false`
      case "folder":
        return ""
      default:
        return `// ${componentName}
// Created: ${new Date().toLocaleDateString()}

// TODO: Add your code here`
    }
  }

  const handleDeleteFile = async (file: FileItem) => {
    if (!project) return

    try {
      // Import and initialize storage manager
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      
      // Delete file directly from IndexedDB
      await storageManager.deleteFile(project.id, file.path);
      console.log('File deleted successfully:', file.name)
      
      await fetchFiles()
      if (selectedFile?.id === file.id) {
        onFileSelect(null)
      }
      
      // Trigger auto cloud backup after file deletion
      triggerAutoBackup(`Deleted file: ${file.name}`)
    } catch (error) {
      console.error("Error deleting file from IndexedDB:", error);
    }
  }

  const handleDeleteFolder = async (folderPath: string) => {
    if (!project) return

    try {
      console.log('Deleting folder from IndexedDB:', folderPath)
      
      // Import and initialize storage manager
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      
      // Get all files in the folder and delete them
      const projectFiles = await storageManager.getFiles(project.id)
      const filesInFolder = projectFiles.filter(file => file.path.startsWith(folderPath + '/'))
      
      // Delete all files in the folder
      for (const file of filesInFolder) {
        await storageManager.deleteFile(project.id, file.path)
      }
      
      // Also delete the folder itself if it exists as a directory record
      const folderFile = projectFiles.find(file => file.path === folderPath && file.isDirectory)
      if (folderFile) {
        await storageManager.deleteFile(project.id, folderPath)
        console.log('Deleted folder record:', folderPath)
      }
      
      console.log(`Deleted ${filesInFolder.length} files from folder: ${folderPath}`)
      
      // Trigger auto cloud backup after folder deletion
      triggerAutoBackup(`Deleted folder: ${folderPath} (${filesInFolder.length} files)`)
      
      // Show success toast
      toast({
        title: "Folder Deleted",
        description: `Successfully deleted folder and ${filesInFolder.length} files inside it.`
      })
      
      await fetchFiles()
    } catch (error) {
      console.error("Error deleting folder from IndexedDB:", error)
      toast({
        title: "Delete Failed",
        description: "Failed to delete folder. Please try again.",
        variant: "destructive"
      })
    }
  }

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const handleToggleFolder = (path: string) => {
    toggleFolder(path)
  }

  // File upload handlers
  const handleFileUpload = async (files: FileList, targetFolder: string | null = null) => {
    if (!project || files.length === 0) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadInFolder(targetFolder)

    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      const uploadPromises = Array.from(files).map(async (file, index) => {
        const filePath = targetFolder ? `${targetFolder}/${file.name}` : file.name
        
        // Read file content
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string || '')
          reader.onerror = reject
          reader.readAsText(file)
        })

        // Determine file type
        const extension = file.name.split('.').pop()?.toLowerCase() || ''
        const fileType = getFileTypeFromExtension(extension)

        // Create file record
        const newFile = await storageManager.createFile({
          workspaceId: project.id,
          name: file.name,
          path: filePath,
          content: content,
          fileType: fileType,
          type: fileType,
          size: content.length,
          isDirectory: false
        })

        // Update progress
        setUploadProgress(((index + 1) / files.length) * 100)

        return newFile
      })

      await Promise.all(uploadPromises)

      // Trigger auto cloud backup after file upload
      triggerAutoBackup(`Uploaded ${files.length} file(s)${targetFolder ? ` to ${targetFolder}` : ''}`)

      toast({
        title: "Files Uploaded",
        description: `Successfully uploaded ${files.length} file(s)${targetFolder ? ` to ${targetFolder}` : ''}.`
      })

      await fetchFiles()
    } catch (error) {
      console.error("Error uploading files:", error)
      toast({
        title: "Upload Failed",
        description: "Failed to upload files. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      setUploadInFolder(null)
    }
  }

  const getFileTypeFromExtension = (extension: string): string => {
    const typeMap: { [key: string]: string } = {
      'tsx': 'text',
      'ts': 'text',
      'jsx': 'text',
      'js': 'text',
      'css': 'text',
      'scss': 'text',
      'sass': 'text',
      'html': 'text',
      'json': 'text',
      'md': 'text',
      'xml': 'text',
      'yml': 'text',
      'yaml': 'text',
      'env': 'text',
      'gitignore': 'text',
      'py': 'text',
      'java': 'text',
      'cpp': 'text',
      'c': 'text',
      'php': 'text',
      'rb': 'text',
      'go': 'text',
      'rs': 'text',
      'sh': 'text',
      'bat': 'text',
      'ps1': 'text',
      'sql': 'text',
      'txt': 'text',
      'log': 'text',
      'conf': 'text',
      'ini': 'text',
      'toml': 'text',
      'png': 'image',
      'jpg': 'image',
      'jpeg': 'image',
      'gif': 'image',
      'svg': 'image',
      'webp': 'image',
      'ico': 'image',
      'pdf': 'document',
      'doc': 'document',
      'docx': 'document',
      'xls': 'document',
      'xlsx': 'document',
      'ppt': 'document',
      'pptx': 'document'
    }
    return typeMap[extension] || 'text'
  }

  const handleUploadClick = (targetFolder: string | null = null) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files) {
        handleFileUpload(files, targetFolder)
      }
    }
    input.click()
  }

  const handleDropUpload = async (e: React.DragEvent, targetFolder: string | null = null) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      await handleFileUpload(files, targetFolder)
    }
  }

  // Export functions
  const handleExportProject = async () => {
    if (!project) return

    setIsExporting(true)
    try {
      // Wait for JSZip to load if it's not ready yet
      if (typeof window !== 'undefined' && !window.JSZip) {
        await new Promise((resolve) => {
          const checkJSZip = () => {
            if (window.JSZip) {
              resolve(void 0)
            } else {
              setTimeout(checkJSZip, 100)
            }
          }
          checkJSZip()
        })
      }

      if (!window.JSZip) {
        throw new Error('JSZip library not loaded')
      }

      // Create new ZIP instance
      const zip = new window.JSZip()

      // Get all files and directories
      const allFiles = files.filter(file => !file.isDirectory)
      const directories = files.filter(file => file.isDirectory)

      console.log(`Export: Found ${allFiles.length} files and ${directories.length} directories`)

      if (allFiles.length === 0) {
        throw new Error('No files found to export')
      }

      // Create directory structure in ZIP
      const createdDirs = new Set<string>()

      // First, create all directory structures
      for (const dir of directories) {
        const dirPath = dir.path.endsWith('/') ? dir.path : dir.path + '/'
        if (!createdDirs.has(dirPath)) {
          zip.folder(dirPath)
          createdDirs.add(dirPath)
        }
      }

      // Track export statistics
      let filesExported = 0
      let filesSkipped = 0
      let emptyFiles = 0

      // Add files to ZIP with their full path structure
      for (const file of allFiles) {
        try {
          // Ensure parent directories exist in ZIP
          const pathParts = file.path.split('/')
          const fileName = pathParts.pop() || file.name
          let currentPath = ''

          for (let i = 0; i < pathParts.length; i++) {
            currentPath += pathParts[i] + '/'
            if (!createdDirs.has(currentPath)) {
              zip.folder(currentPath)
              createdDirs.add(currentPath)
            }
          }

          // Handle different content scenarios
          if (file.content && file.content.trim().length > 0) {
            // File has content
            zip.file(file.path, file.content)
            filesExported++
          } else if (file.content === '' || file.content === null || file.content === undefined) {
            // Empty file - still include it
            zip.file(file.path, '')
            emptyFiles++
          } else {
            // File has some content
            zip.file(file.path, file.content)
            filesExported++
          }
        } catch (fileError) {
          console.warn(`Failed to export file ${file.path}:`, fileError)
          filesSkipped++
        }
      }

      console.log(`Export complete: ${filesExported} files exported, ${emptyFiles} empty files included, ${filesSkipped} files skipped`)

      // Show summary in toast
      if (filesSkipped > 0) {
        toast({
          title: "Export Warning",
          description: `Exported ${filesExported + emptyFiles} files (${filesSkipped} skipped due to errors)`,
          variant: "default"
        })
      }

      // Generate ZIP content
      const zipContent = await zip.generateAsync({ type: 'uint8array' })

      // Create blob and download
      const blob = new Blob([zipContent], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `project-${project.name || project.id}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast({
        title: "Export Complete",
        description: `Project exported as ${project.name || project.id}.zip`,
      })
    } catch (error) {
      console.error('Export error:', error)
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export project. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportSelected = async (filePaths: string[]) => {
    if (!project || filePaths.length === 0) return

    setIsExporting(true)
    try {
      // Wait for JSZip to load if it's not ready yet
      if (typeof window !== 'undefined' && !window.JSZip) {
        await new Promise((resolve) => {
          const checkJSZip = () => {
            if (window.JSZip) {
              resolve(void 0)
            } else {
              setTimeout(checkJSZip, 100)
            }
          }
          checkJSZip()
        })
      }

      if (!window.JSZip) {
        throw new Error('JSZip library not loaded')
      }

      // Create new ZIP instance
      const zip = new window.JSZip()

      // Filter files by selected paths
      const selectedFiles = files.filter(file =>
        filePaths.includes(file.path) && !file.isDirectory
      )

      console.log(`Export: Selected ${selectedFiles.length} files from ${filePaths.length} selected paths`)

      if (selectedFiles.length === 0) {
        throw new Error('No files found to export')
      }

      // Create directory structure for selected files
      const createdDirs = new Set<string>()

      // Track export statistics
      let filesExported = 0
      let filesSkipped = 0
      let emptyFiles = 0

      // Add files to ZIP with their full path structure
      for (const file of selectedFiles) {
        try {
          // Ensure parent directories exist in ZIP
          const pathParts = file.path.split('/')
          const fileName = pathParts.pop() || file.name
          let currentPath = ''

          for (let i = 0; i < pathParts.length; i++) {
            currentPath += pathParts[i] + '/'
            if (!createdDirs.has(currentPath)) {
              zip.folder(currentPath)
              createdDirs.add(currentPath)
            }
          }

          // Handle different content scenarios
          if (file.content && file.content.trim().length > 0) {
            // File has content
            zip.file(file.path, file.content)
            filesExported++
          } else if (file.content === '' || file.content === null || file.content === undefined) {
            // Empty file - still include it
            zip.file(file.path, '')
            emptyFiles++
          } else {
            // File has some content
            zip.file(file.path, file.content)
            filesExported++
          }
        } catch (fileError) {
          console.warn(`Failed to export file ${file.path}:`, fileError)
          filesSkipped++
        }
      }

      console.log(`Selected export complete: ${filesExported} files exported, ${emptyFiles} empty files included, ${filesSkipped} files skipped`)

      // Show summary in toast
      if (filesSkipped > 0) {
        toast({
          title: "Export Warning",
          description: `Exported ${filesExported + emptyFiles} selected files (${filesSkipped} skipped due to errors)`,
          variant: "default"
        })
      }

      // Generate ZIP content
      const zipContent = await zip.generateAsync({ type: 'uint8array' })

      // Create blob and download
      const blob = new Blob([zipContent], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `selected-files-${project.name || project.id}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast({
        title: "Export Complete",
        description: `${filesExported + emptyFiles} file(s) exported as zip`,
      })
    } catch (error) {
      console.error('Export error:', error)
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export selected files. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsExporting(false)
    }
  }

  const renderFileNode = (node: FileNode, depth = 0) => {
    const isSelected = selectedFile?.id === node.file?.id
    const isSearchMatch = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase())

    return (
      <div key={node.path}
        draggable={node.type === "file"}
        onDragStart={node.type === "file" ? (e) => handleDragStart(e, node) : undefined}
        onDragEnter={node.type === "folder" ? (e) => { e.preventDefault(); setDragOverFolder(node.path) } : undefined}
        onDragOver={node.type === "folder" ? (e) => { e.preventDefault(); setDragOverFolder(node.path) } : undefined}
        onDragLeave={node.type === "folder" ? () => setDragOverFolder(null) : undefined}
        onDrop={node.type === "folder" ? (e) => handleDrop(e, node) : undefined}
      >
        <ContextMenu>
            <ContextMenuTrigger>
            <div
              className={`flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-800/60 rounded cursor-pointer transition-colors ${
                isSelected ? "bg-gray-800 text-gray-100" : "text-gray-400"
              } ${isSearchMatch ? "bg-yellow-900/20" : ""} ${node.type === 'folder' && node.path === dragOverFolder ? 'bg-sky-900/20 ring-1 ring-sky-600' : ''}`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => {
                if (node.type === "folder") {
                  toggleFolder(node.path)
                } else if (node.file) {
                  onFileSelect(node.file)
                }
              }}
            >
              {node.type === "folder" ? (
                <>
                  {node.expanded ? (
                    <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />
                  )}
                  {node.expanded ? (
                    <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  )}
                </>
              ) : (
                <>
                  <div className="w-3" />
                  {getFileIcon(node.name)}
                </>
              )}
              <span className="text-sm truncate font-mono">{node.name}</span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {node.type === "file" && node.file && (
              <>
                <ContextMenuItem onClick={() => onFileSelect(node.file!)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Open
                </ContextMenuItem>
                  <ContextMenuItem onClick={() => {
                    setRenamingFile(node.path)
                    setRenameValue(node.name)
                  }}>
                    <Edit className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                <ContextMenuItem onClick={() => handleExportSelected([node.path])}>
                  <Download className="mr-2 h-4 w-4" />
                  Download File
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleDeleteFile(node.file!)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </ContextMenuItem>
              </>
            )}
  {/* Rename Dialog */}
  <Dialog open={!!renamingFile} onOpenChange={v => { if (!v) setRenamingFile(null) }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Rename File</DialogTitle>
        <DialogDescription>Enter a new name for the file.</DialogDescription>
      </DialogHeader>
      <Input id="rename-file" value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus />
      <DialogFooter>
        <Button onClick={handleRenameFile} disabled={!renameValue.trim()}>Rename</Button>
        <Button variant="ghost" onClick={() => setRenamingFile(null)}>Cancel</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
            {node.type === "folder" && (
              <>
                <ContextMenuItem onClick={() => toggleFolder(node.path)}>
                  {node.expanded ? (
                    <>
                      <ChevronRight className="mr-2 h-4 w-4" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Expand
                    </>
                  )}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  // Get all files in this folder
                  const folderFiles = fileTree.filter(f => f.path.startsWith(node.path + '/')).map(f => f.path)
                  handleExportSelected(folderFiles)
                }}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Folder
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleDeleteFolder(node.path)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Folder
                </ContextMenuItem>
                  <ContextMenuItem onClick={() => {
                    setIsCreateDialogOpen(true)
                    setNewFileType("tsx")
                    setNewFileName("")
                    setCreateInFolder(node.path)
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    New File
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleUploadClick(node.path)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Files
                  </ContextMenuItem>
              </>
            )}
            <ContextMenuItem onClick={() => handleExportProject()}>
              <Download className="mr-2 h-4 w-4" />
              Export All as ZIP
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => {
              setNewFileType("folder")
              setIsCreateDialogOpen(true)
            }}>
              <Folder className="mr-2 h-4 w-4" />
              New Folder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => {
              setNewFileType("tsx")
              setIsCreateDialogOpen(true)
            }}>
              <Plus className="mr-2 h-4 w-4" />
              New File
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleUploadClick(null)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {node.type === "folder" && node.expanded && node.children.map((child) => renderFileNode(child, depth + 1))}
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-4 text-center text-gray-500">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select a project to view files</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-r border-gray-800/60 bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800/60 bg-gray-900/80">
        <h3 className="text-sm font-semibold flex items-center">
          <Folder className="w-4 h-4 mr-2" />
          Files
        </h3>
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCreateDialogOpen(true)}
            className="h-8 w-8 p-0"
            title="New File/Folder"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className="h-8 w-8 p-0"
            title="Search Files"
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportProject}
            disabled={isExporting}
            className="h-8 w-8 p-0"
            title="Export Project as ZIP"
          >
            {isExporting ? (
              <Archive className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="mb-2">
          <Input
            id="search-files"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      )}

      {/* File Tree Container - Fixed height with scrolling */}
      <div className="flex-1 overflow-hidden">
        <div 
          className="h-full overflow-y-auto overflow-x-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDropUpload(e, null)}
        >
          {files.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No files yet</p>
              <p className="text-xs">Create your first file or drag & drop files to get started</p>
            </div>
          ) : (
            <div className="p-2">
              {fileTree.map((node) => renderFileNode(node))}
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress Indicator */}
      {isUploading && (
        <div className="border-t border-gray-800/60 p-2">
          <div className="flex items-center space-x-2">
            <Upload className="h-4 w-4 text-gray-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">
                Uploading files{uploadInFolder ? ` to ${uploadInFolder}` : ''}...
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-gray-500">
              {Math.round(uploadProgress)}%
            </div>
          </div>
        </div>
      )}

      {/* Create File Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newFileType === "folder" ? "Create New Folder" : "Create New File"}
            </DialogTitle>
            <DialogDescription>
              {newFileType === "folder" 
                ? "Add a new folder to your project." 
                : "Add a new file to your project."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="fileName">
                {newFileType === "folder" ? "Folder Name" : "File Name"}
              </Label>
              <Input
                id="fileName"
                placeholder={
                  newFileType === "folder" 
                    ? "my-folder" 
                    : newFileType === "tsx" || newFileType === "jsx"
                    ? "MyComponent"
                    : newFileType === "css" || newFileType === "scss" || newFileType === "sass"
                    ? "styles"
                    : newFileType === "json"
                    ? "config"
                    : newFileType === "md"
                    ? "README"
                    : newFileType === "html"
                    ? "index"
                    : newFileType === "py"
                    ? "main"
                    : newFileType === "java"
                    ? "Main"
                    : newFileType === "sh"
                    ? "script"
                    : newFileType === "sql"
                    ? "database"
                    : newFileType === "env"
                    ? ".env"
                    : newFileType === "gitignore"
                    ? ".gitignore"
                    : "filename"
                }
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fileType">File Type</Label>
              <Select value={newFileType} onValueChange={setNewFileType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="folder">📁 Folder</SelectItem>
                  <SelectItem value="tsx">⚛️ React Component (.tsx)</SelectItem>
                  <SelectItem value="jsx">⚛️ React Component (.jsx)</SelectItem>
                  <SelectItem value="ts">🔷 TypeScript (.ts)</SelectItem>
                  <SelectItem value="js">🟨 JavaScript (.js)</SelectItem>
                  <SelectItem value="css">🎨 CSS (.css)</SelectItem>
                  <SelectItem value="scss">🎨 SCSS (.scss)</SelectItem>
                  <SelectItem value="sass">🎨 Sass (.sass)</SelectItem>
                  <SelectItem value="json">📄 JSON (.json)</SelectItem>
                  <SelectItem value="md">📝 Markdown (.md)</SelectItem>
                  <SelectItem value="html">🌐 HTML (.html)</SelectItem>
                  <SelectItem value="xml">📝 XML (.xml)</SelectItem>
                  <SelectItem value="yml">⚙️ YAML (.yml)</SelectItem>
                  <SelectItem value="yaml">⚙️ YAML (.yaml)</SelectItem>
                  <SelectItem value="env">⚙️ Environment (.env)</SelectItem>
                  <SelectItem value="gitignore">🔒 Git Ignore (.gitignore)</SelectItem>
                  <SelectItem value="py">🐍 Python (.py)</SelectItem>
                  <SelectItem value="java">☕ Java (.java)</SelectItem>
                  <SelectItem value="cpp">🔧 C++ (.cpp)</SelectItem>
                  <SelectItem value="c">🔧 C (.c)</SelectItem>
                  <SelectItem value="php">🐘 PHP (.php)</SelectItem>
                  <SelectItem value="rb">💎 Ruby (.rb)</SelectItem>
                  <SelectItem value="go">🐹 Go (.go)</SelectItem>
                  <SelectItem value="rs">⚡ Rust (.rs)</SelectItem>
                  <SelectItem value="sh">🐚 Shell Script (.sh)</SelectItem>
                  <SelectItem value="bat">🪟 Batch (.bat)</SelectItem>
                  <SelectItem value="ps1">🔷 PowerShell (.ps1)</SelectItem>
                  <SelectItem value="sql">🗃️ SQL (.sql)</SelectItem>
                  <SelectItem value="txt">📄 Text (.txt)</SelectItem>
                  <SelectItem value="log">📊 Log (.log)</SelectItem>
                  <SelectItem value="conf">⚙️ Config (.conf)</SelectItem>
                  <SelectItem value="ini">⚙️ INI (.ini)</SelectItem>
                  <SelectItem value="toml">⚙️ TOML (.toml)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateFile} disabled={!newFileName.trim() || isCreating}>
              {isCreating 
                ? "Creating..." 
                : newFileType === "folder" 
                  ? "Create Folder" 
                  : "Create File"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
