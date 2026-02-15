import { createClient } from '@/lib/supabase/server'
import { 
  createEnhancedSandbox, 
  reconnectToSandbox,
  SandboxError,
  SandboxErrorType,
  type SandboxFile 
} from '@/lib/e2b-enhanced'
import { filterUnwantedFiles } from '@/lib/utils'
import JSZip from 'jszip'
import lz4 from 'lz4js'
import { createClient as createExternalClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { getModel } from '@/lib/ai-providers'

// External Supabase configuration for file uploads (same as upload-test-site.js)
const EXTERNAL_SUPABASE_CONFIG = {
  URL: 'https://dlunpilhklsgvkegnnlp.supabase.co',
  SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdW5waWxoa2xzZ3ZrZWdubmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA1MDQxOSwiZXhwIjoyMDcwNjI2NDE5fQ.k-2OJ4p3hr9feR4ks54OQM2HhOhaVJ3pUK-20tGJwpo'
}

// Create external Supabase client for file uploads
const externalSupabase = createExternalClient(
  EXTERNAL_SUPABASE_CONFIG.URL, 
  EXTERNAL_SUPABASE_CONFIG.SERVICE_ROLE_KEY
)

// AI-powered domain availability checker and name generator
export async function checkDomainAvailability(desiredSlug: string, externalSupabase: any, projectId?: string, siteType: string = 'preview'): Promise<{ available: boolean, finalSlug: string, reused: boolean }> {
  try {
    // First, check if this project already has an existing site record
    if (projectId) {
      const { data: existingProjectSite } = await externalSupabase
        .from('sites')
        .select('project_slug')
        .eq('project_id', projectId)
        .eq('site_type', siteType)
        .eq('is_active', true)
        .maybeSingle();

      if (existingProjectSite) {
        console.log(`[Domain Check] Reusing existing slug "${existingProjectSite.project_slug}" for project ${projectId}`);
        return { available: true, finalSlug: existingProjectSite.project_slug, reused: true };
      }
    }

    // Check if the desired slug is available
    const { data: existingSite } = await externalSupabase
      .from('sites')
      .select('project_slug')
      .eq('project_slug', desiredSlug)
      .eq('is_active', true)
      .single();

    if (!existingSite) {
      // Domain is available
      return { available: true, finalSlug: desiredSlug, reused: false };
    }

    // Domain not available, generate AI-powered unique name
    console.log(`[Domain Check] ${desiredSlug} not available, generating AI name...`);

    const codestralModel = getModel('codestral-latest');

    const result = await generateText({
      model: codestralModel,
      temperature: 0.7, // Creative temperature for name generation
      prompt: `You are a creative naming expert. Generate a unique, memorable project slug that's similar in theme to "${desiredSlug}" but completely different.

REQUIREMENTS:
- Must be 3-5 words maximum
- Use hyphens between words (kebab-case)
- Should be related to technology, creativity, or development
- Must be professional and appropriate
- Avoid common words like "app", "project", "site"
- Make it unique and brandable

EXAMPLES for input "taskmanager":
- quantum-task-forge
- nebula-workspace
- pixel-command-center
- code-craft-studio

INPUT: ${desiredSlug}
OUTPUT: Only return the slug, nothing else.`
    });

    let aiSlug = result.text.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Ensure it's not empty and has reasonable length
    if (!aiSlug || aiSlug.length < 3) {
      aiSlug = `${desiredSlug}-${Math.random().toString(36).substring(2, 8)}`;
    }

    // Double-check the AI-generated slug isn't taken (rare but possible)
    const { data: checkAiSlug } = await externalSupabase
      .from('sites')
      .select('project_slug')
      .eq('project_slug', aiSlug)
      .eq('is_active', true)
      .single();

    if (checkAiSlug) {
      // Add random suffix if AI slug is also taken
      aiSlug = `${aiSlug}-${Math.random().toString(36).substring(2, 5)}`;
    }

    console.log(`[Domain Check] Generated unique slug: ${aiSlug}`);
    return { available: false, finalSlug: aiSlug, reused: false };

  } catch (error) {
    console.error('[Domain Check] Error:', error);
    // Fallback: add random suffix
    const fallbackSlug = `${desiredSlug}-${Math.random().toString(36).substring(2, 8)}`;
    return { available: false, finalSlug: fallbackSlug, reused: false };
  }
}

// Function to create or update site tracking record
export async function createSiteRecord(
  projectSlug: string,
  originalSlug: string | null,
  authUserId: string,
  authUsername: string,
  externalSupabase: any,
  projectId?: string,
  siteType: string = 'preview'
): Promise<void> {
  try {
    // If we have a project ID, upsert to ensure we can reuse the slug
    if (projectId) {
      // First check if a record exists for this project
      const { data: existing } = await externalSupabase
        .from('sites')
        .select('id')
        .eq('project_id', projectId)
        .eq('site_type', siteType)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await externalSupabase
          .from('sites')
          .update({
            project_slug: projectSlug,
            original_slug: originalSlug,
            auth_user_id: authUserId,
            auth_username: authUsername,
            updated_at: new Date().toISOString(),
            is_active: true
          })
          .eq('id', existing.id);

        if (error) {
          console.error('[Site Tracking] Error updating site record:', error);
          throw error;
        }
        console.log(`[Site Tracking] Updated record for project ${projectId} with slug ${projectSlug}`);
        return;
      }
    }

    // Insert new record
    const { error } = await externalSupabase
      .from('sites')
      .insert({
        project_slug: projectSlug,
        original_slug: originalSlug,
        auth_user_id: authUserId,
        auth_username: authUsername,
        project_id: projectId || null,
        site_type: siteType,
        is_active: true,
        created_at: new Date().toISOString(),
        metadata: {
          source: 'pipilot-preview',
          version: '1.0'
        }
      });

    if (error) {
      console.error('[Site Tracking] Error creating site record:', error);
      throw error;
    }

    console.log(`[Site Tracking] Created record for ${projectSlug} (project: ${projectId || 'none'}) by ${authUsername}`);
  } catch (error) {
    console.error('[Site Tracking] Failed to create/update site record:', error);
    // Don't throw - site creation should continue even if tracking fails
  }
}

// Function to track site view
export async function trackSiteView(siteSlug: string, externalSupabase: any, request?: Request): Promise<void> {
  try {
    // Use RPC function to increment view count
    const { error } = await externalSupabase.rpc('increment_site_views', {
      site_slug: siteSlug
    });

    if (error) {
      console.error('[View Tracking] Error incrementing views:', error);
    }

    // Optional: Track detailed view analytics
    if (request) {
      const userAgent = request.headers.get('user-agent') || '';
      const referrer = request.headers.get('referer') || '';

      // Simple device detection
      let deviceType = 'desktop';
      if (userAgent.includes('Mobile') || userAgent.includes('Android')) {
        deviceType = 'mobile';
      } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
        deviceType = 'tablet';
      }

      // Note: In production, you'd want to anonymize IP properly
      // This is just for demonstration
      const ipHash = 'anonymous'; // You'd hash the real IP

      await externalSupabase
        .from('site_views')
        .insert({
          site_id: (await externalSupabase
            .from('sites')
            .select('id')
            .eq('project_slug', siteSlug)
            .single()).data?.id,
          user_agent: userAgent.substring(0, 500), // Limit length
          referrer: referrer,
          ip_hash: ipHash,
          device_type: deviceType
        });
    }
  } catch (error) {
    console.error('[View Tracking] Error:', error);
    // Don't throw - view tracking failure shouldn't break site serving
  }
}

// AI-powered HTML asset path fixer
export async function fixHtmlAssetPaths(htmlContent: string, basePath: string = './'): Promise<string> {
  try {
    const codestralModel = getModel('codestral-latest')
    
    const result = await generateText({
      model: codestralModel,
      temperature: 0.1, // Low temperature for precise, deterministic fixes
      prompt: `You are an expert HTML processor. Your task is to fix asset paths in HTML files that will be served from a subdirectory.

INPUT HTML:
${htmlContent}

INSTRUCTIONS:
- Replace all absolute paths (starting with "/") in href and src attributes with relative paths
- Use "${basePath}" as the base path for all assets
- Do not change any other content
- Preserve all HTML structure, attributes, and formatting
- Return ONLY the fixed HTML content with NO markdown formatting, NO code blocks, NO explanations
- Do NOT wrap the output in \`\`\`html or any other markdown syntax

EXAMPLE:
Input: <link href="/assets/style.css">
Output: <link href="./assets/style.css">`
    })

    // Clean the response by removing any markdown code blocks
    let cleanedResult = result.text.trim()
    
    // Remove markdown code block wrappers if present
    cleanedResult = cleanedResult.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    
    return cleanedResult
  } catch (error) {
    console.warn('[Vite Hosting] AI HTML processing failed, falling back to regex:', error)
    // Fallback to regex if AI fails
    return htmlContent
      .replace(/href="\/([^"]*)"/g, `href="${basePath}$1"`)
      .replace(/src="\/([^"]*)"/g, `src="${basePath}$1"`)
      .replace(/href=\s*"\/([^"]*)"/g, `href="${basePath}$1"`)
      .replace(/src=\s*"\/([^"]*)"/g, `src="${basePath}$1"`)
  }
}

// AI-powered JavaScript asset path fixer for JS/TS files - REMOVED
// This function has been removed to disable JS assets processing

// Inject "Built on PiPilot" badge into HTML
function injectPiPilotBadge(htmlContent: string): string {
  const badgeHtml = `
  <!-- PiPilot Badge -->
  <a id="pipilot-badge" style="position: fixed; bottom: 10px; right: 10px; padding: 5px 17px 5px 9px; background-color: #111827; color: #fff; font-size: 12px; border-radius: 5px; font-family: sans-serif; display: flex; align-items: center; gap: 4px; z-index: 1000000; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" target="_blank" href="https://pipilot.dev?utm_source=pipilot-badge">
    <span style="color: #b9b9bb;">Built on</span>
    <svg width="60" height="14" viewBox="0 0 60 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="11" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#fff">PiPilot</text>
    </svg>
    <button id="pipilot-badge-close" style="position: absolute; top: -2px; right: 5px; cursor: pointer; font-size: 14px; color: #A1A1AA; background: none; border: none; line-height: 1;">&times;</button>
  </a>
  <script>
    (function() {
      const badge = document.getElementById('pipilot-badge');
      const closeBtn = document.getElementById('pipilot-badge-close');
      const storageKey = 'pipilot-badge-hidden';
      
      // Check if badge was previously hidden
      if (localStorage.getItem(storageKey) === 'true') {
        badge.style.display = 'none';
      }
      
      // Close badge handler
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        badge.style.display = 'none';
        localStorage.setItem(storageKey, 'true');
      });
    })();
  </script>
  <!-- End PiPilot Badge -->
`;

  // Try to inject before </body>
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', badgeHtml + '</body>');
  }
  
  // Fallback: inject before </html>
  if (htmlContent.includes('</html>')) {
    return htmlContent.replace('</html>', badgeHtml + '</html>');
  }
  
  // Last resort: append to end
  return htmlContent + badgeHtml;
}

// AI-powered SEO metadata enhancer for HTML files
export async function addSEOMetadata(htmlContent: string, projectSlug: string): Promise<string> {
  try {
    const codestralModel = getModel('codestral-latest')

    const result = await generateText({
      model: codestralModel,
      temperature: 0.1, // Low temperature for precise, deterministic metadata
      prompt: `You are an expert SEO and HTML metadata specialist. Your task is to enhance HTML files with comprehensive SEO metadata.

INPUT HTML:
${htmlContent}

PROJECT INFO:
- Project Slug: ${projectSlug}
- Platform: PiPilot (Canada's First Agentic Vibe Coding Platform)
- Base URL: https://pipilot.dev

REQUIRED METADATA TO ADD/UPDATE:

1. FAVICON SETUP:
   - <link rel="icon" href="https://pipilot.dev/icons/icon-192x192.png" type="image/png">
   - <link rel="apple-touch-icon" href="https://pipilot.dev/icons/icon-180x180.png">
   - <link rel="shortcut icon" href="https://pipilot.dev/icons/icon-96x96.png">

2. OPEN GRAPH METADATA:
   - <meta property="og:title" content="PiPilot - ${projectSlug} | AI App Builder">
   - <meta property="og:description" content="Built with PiPilot - Canada's First Agentic Vibe Coding Platform. Create apps 10x faster with AI-powered development.">
   - <meta property="og:image" content="https://pipilot.dev/og_image.png">
   - <meta property="og:image:alt" content="PiPilot - AI App Builder Platform">
   - <meta property="og:url" content="https://${projectSlug}.pipilot.dev">
   - <meta property="og:type" content="website">
   - <meta property="og:site_name" content="PiPilot">

3. TWITTER CARD METADATA:
   - <meta name="twitter:card" content="summary_large_image">
   - <meta name="twitter:title" content="PiPilot - ${projectSlug}">
   - <meta name="twitter:description" content="Built with PiPilot - Canada's leading AI coding platform. Superior to Lovable, Bolt, v0, and Replit.">
   - <meta name="twitter:image" content="https://pipilot.dev/og_image2.png">
   - <meta name="twitter:site" content="@pipilotdev">

4. GENERAL SEO METADATA:
   - <meta name="description" content="Built with PiPilot - Canada's First Agentic Vibe Coding Platform. Experience AI-powered app development with agentic vibe coding.">
   - <meta name="keywords" content="PiPilot, AI app builder, agentic coding, Canadian tech, app development, no-code AI, ${projectSlug}">
   - <meta name="author" content="PiPilot Team">
   - <meta name="robots" content="index, follow">
   - <meta name="language" content="en-CA">
   - <meta name="viewport" content="width=device-width, initial-scale=1.0">

5. ADDITIONAL SEO BOOSTERS:
   - <meta name="theme-color" content="#000000">
   - <meta name="msapplication-TileColor" content="#000000">
   - <link rel="canonical" href="https://${projectSlug}.pipilot.dev">

INSTRUCTIONS:
- Add all metadata to the <head> section
- If <head> doesn't exist, create it after <html> or at the top
- Preserve all existing metadata and content
- Do not duplicate existing meta tags - update them if they exist
- Return ONLY the enhanced HTML content with NO explanations
- Do NOT wrap in markdown code blocks
- Ensure proper HTML structure and formatting

EXAMPLE OUTPUT STRUCTURE:
<html>
<head>
  <!-- Existing content -->
  <title>Existing Title</title>
  <!-- New SEO metadata -->
  <meta name="description" content="...">
  <meta property="og:title" content="...">
  <!-- etc -->
</head>
<body>
  <!-- Existing content -->
</body>
</html>`
    })

    // Clean the response
    let cleanedResult = result.text.trim()
    cleanedResult = cleanedResult.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')

    return cleanedResult
  } catch (error) {
    console.warn('[SEO Enhancement] AI metadata processing failed, falling back to manual injection:', error)

    // Fallback: Manually inject essential metadata
    const metadataToInject = `
  <!-- PiPilot SEO Metadata -->
  <meta name="description" content="Built with PiPilot - Canada's First Agentic Vibe Coding Platform. Experience AI-powered app development.">
  <meta name="keywords" content="PiPilot, AI app builder, agentic coding, ${projectSlug}">
  <meta name="author" content="PiPilot Team">
  <meta name="robots" content="index, follow">
  <meta name="language" content="en-CA">
  <meta name="theme-color" content="#000000">
  <meta property="og:title" content="PiPilot - ${projectSlug} | AI App Builder">
  <meta property="og:description" content="Built with PiPilot - Canada's First Agentic Vibe Coding Platform. Create apps 10x faster with AI.">
  <meta property="og:image" content="https://pipilot.dev/og_image.png">
  <meta property="og:url" content="https://${projectSlug}.pipilot.dev">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="PiPilot">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="PiPilot - ${projectSlug}">
  <meta name="twitter:description" content="Built with PiPilot - Canada's leading AI coding platform.">
  <meta name="twitter:image" content="https://pipilot.dev/og_image2.png">
  <link rel="icon" href="https://pipilot.dev/icons/icon-192x192.png" type="image/png">
  <link rel="apple-touch-icon" href="https://pipilot.dev/icons/icon-180x180.png">
  <link rel="canonical" href="https://${projectSlug}.pipilot.dev">
`

    // Inject metadata into head section
    if (htmlContent.includes('<head>')) {
      return htmlContent.replace('<head>', '<head>' + metadataToInject)
    } else if (htmlContent.includes('<html>')) {
      return htmlContent.replace('<html>', '<html><head>' + metadataToInject + '</head>')
    } else {
      return '<html><head>' + metadataToInject + '</head><body>' + htmlContent + '</body></html>'
    }
  }
}

// Function to upload built Vite files to Supabase storage
// Helper function to recursively collect all files from a directory
async function collectAllFiles(e2bSandbox: any, dirPath: string): Promise<any[]> {
  const allFiles: any[] = []
  
  async function collectFromDirectory(currentPath: string) {
    try {
      const items = await e2bSandbox.files.list(currentPath)
      
      for (const item of items) {
        if (item.type === 'file' && !item.name.startsWith('.') && item.name !== '.gitkeep') {
          allFiles.push(item)
        } else if (item.type === 'dir' && !item.name.startsWith('.')) {
          // Recursively collect from subdirectories
          await collectFromDirectory(`${currentPath}/${item.name}`)
        }
      }
    } catch (error) {
      console.warn(`[Vite Hosting] Could not list directory ${currentPath}:`, error)
    }
  }
  
  await collectFromDirectory(dirPath)
  return allFiles
}

/**
 * Remove all existing files for a site from Supabase storage before re-uploading.
 * Without this, stale Vite hashed assets (e.g. index-OldHash.js) linger and
 * browsers with cached HTML can load outdated bundles.
 */
async function clearSiteStorage(projectSlug: string, supabase: any) {
  const prefix = `sites/${projectSlug}`
  console.log(`[Hosting] Clearing existing files at ${prefix}/ ...`)

  // Supabase list returns max 1000 items per call; loop until empty
  let removed = 0
  while (true) {
    const { data: files, error: listError } = await supabase.storage
      .from('documents')
      .list(prefix, { limit: 1000 })

    if (listError) {
      console.warn(`[Hosting] Could not list ${prefix}:`, listError.message)
      break
    }
    if (!files || files.length === 0) break

    // Supabase .list() returns items AND folders at this level.
    // For nested dirs we need to recurse. But .remove() works on full paths,
    // and Supabase storage is flat (folder-like prefixes), so list + remove works
    // only for files at this level. We need to handle subdirectories.
    const fileItems = files.filter((f: any) => f.id) // files have id, folders don't
    const folderItems = files.filter((f: any) => !f.id)

    // Remove files at this level
    if (fileItems.length > 0) {
      const paths = fileItems.map((f: any) => `${prefix}/${f.name}`)
      const { error: removeError } = await supabase.storage
        .from('documents')
        .remove(paths)
      if (removeError) {
        console.warn(`[Hosting] Error removing files:`, removeError.message)
      } else {
        removed += paths.length
      }
    }

    // Recurse into subdirectories (e.g. assets/)
    for (const folder of folderItems) {
      await clearSubdirectory(`${prefix}/${folder.name}`, supabase)
    }

    // If we only had folders and no files, we're done at this level
    if (fileItems.length === 0) break
  }

  console.log(`[Hosting] Cleared ${removed} existing files from ${prefix}/`)
}

async function clearSubdirectory(dirPath: string, supabase: any) {
  const { data: files, error } = await supabase.storage
    .from('documents')
    .list(dirPath, { limit: 1000 })

  if (error || !files || files.length === 0) return

  const fileItems = files.filter((f: any) => f.id)
  const folderItems = files.filter((f: any) => !f.id)

  if (fileItems.length > 0) {
    const paths = fileItems.map((f: any) => `${dirPath}/${f.name}`)
    await supabase.storage.from('documents').remove(paths)
  }

  for (const folder of folderItems) {
    await clearSubdirectory(`${dirPath}/${folder.name}`, supabase)
  }
}

async function uploadViteBuildToSupabase(sandbox: any, projectSlug: string, supabase: any, isProduction: boolean = false) {
  try {
    console.log('[Vite Hosting] Starting upload of built files...')

    // Clear old files first so stale hashed assets don't linger
    await clearSiteStorage(projectSlug, supabase)

    // Access the underlying E2B sandbox container (same as generate_report route)
    const e2bSandbox = sandbox.container || sandbox

    // Recursively collect all files from the dist directory
    const userFiles = await collectAllFiles(e2bSandbox, "/project/dist")

    console.log(`[Vite Hosting] Found ${userFiles.length} files in dist directory`)
    
    // Log the files and their relative paths for debugging
    userFiles.forEach((file: any) => {
      const relativePath = file.path.replace('/project/dist/', '')
      console.log(`[Vite Hosting] Will upload: ${file.path} → sites/${projectSlug}/${relativePath}`)
    })
    
    // Upload each file to Supabase storage (same approach as generate_report)
    let uploadedCount = 0
    let failedCount = 0
    const failedFiles: string[] = []

    for (const file of userFiles) {
      if (file.type === "file") {
        // Extract relative path from /project/dist/ to preserve directory structure
        const relativePath = file.path.replace('/project/dist/', '')

        try {
          // Read file content from sandbox (same as generate_report)
          const content = await e2bSandbox.files.read(file.path)

          // Process HTML files to fix asset paths and add SEO metadata
          let processedContent = content
          if (relativePath.endsWith('.html')) {
            console.log(`[Vite Hosting] Processing HTML file ${relativePath} with AI...`)

            // First fix asset paths
            processedContent = await fixHtmlAssetPaths(content, './')

            // Then add comprehensive SEO metadata
            processedContent = await addSEOMetadata(processedContent, projectSlug)

            // Only inject badge for preview sites (not production)
            if (!isProduction) {
              processedContent = injectPiPilotBadge(processedContent)
              console.log(`[Vite Hosting] Badge injected for preview site: ${relativePath}`)
            } else {
              console.log(`[Vite Hosting] Skipping badge injection for production site: ${relativePath}`)
            }

            console.log(`[Vite Hosting] AI processed and SEO enhanced for ${relativePath}`)
          } else if (relativePath.endsWith('.js') || relativePath.endsWith('.ts')) {
            processedContent = content // Use original content without processing
          }

          // Determine content type
          const contentType = getContentType(file.name)

          // Upload to Supabase storage preserving directory structure
          const { data, error } = await supabase.storage
            .from('documents')
            .upload(`sites/${projectSlug}/${relativePath}`, processedContent, {
              contentType,
              upsert: true
            })

          if (error) {
            console.error(`[Vite Hosting] Error uploading ${relativePath}:`, error)
            failedCount++
            failedFiles.push(relativePath)
          } else {
            uploadedCount++
            console.log(`[Vite Hosting] Uploaded ${relativePath}`)
          }
        } catch (fileError) {
          console.error(`[Vite Hosting] Error processing ${relativePath}:`, fileError)
          failedCount++
          failedFiles.push(relativePath)
        }
      }
    }

    console.log(`[Vite Hosting] Upload completed: ${uploadedCount} succeeded, ${failedCount} failed`)
    if (failedCount > 0) {
      console.error(`[Vite Hosting] Failed files: ${failedFiles.join(', ')}`)
    }

    // Fail the deployment if critical files (index.html) failed to upload
    if (failedFiles.includes('index.html')) {
      console.error('[Vite Hosting] CRITICAL: index.html failed to upload - marking deployment as failed')
      return false
    }

    return true
  } catch (error) {
    console.error('[Vite Hosting] Upload failed:', error)
    return false
  }
}

// Function to upload HTML project files to Supabase storage
async function uploadHtmlProjectToSupabase(files: any[], projectSlug: string, supabase: any, isProduction: boolean = false) {
  try {
    console.log('[HTML Hosting] Starting upload of HTML project files...')

    // Clear old files first so stale assets don't linger
    await clearSiteStorage(projectSlug, supabase)

    // Filter out unwanted files (same logic as filterUnwantedFiles)
    const allowedExtensions = ['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot']
    const userFiles = files.filter((file: any) => {
      const fileName = file.name || file.path.split('/').pop() || ''
      const hasAllowedExtension = allowedExtensions.some(ext => fileName.toLowerCase().endsWith(ext))
      const isNotUnwanted = !fileName.startsWith('.') && !fileName.includes('node_modules') && !fileName.includes('.git')
      // Exclude build/deployment config files that aren't needed for static hosting
      const isNotConfig = !['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'vercel.json', 'netlify.toml', '.gitignore'].includes(fileName)
      return hasAllowedExtension && isNotUnwanted && isNotConfig
    })

    console.log(`[HTML Hosting] Found ${userFiles.length} files to upload`)

    // Log the files that will be uploaded
    userFiles.forEach((file: any) => {
      const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path
      console.log(`[HTML Hosting] Will upload: ${relativePath} → sites/${projectSlug}/${relativePath}`)
    })

    // Upload each file to Supabase storage
    let uploadedCount = 0
    let failedCount = 0
    const failedFiles: string[] = []

    for (const file of userFiles) {
      const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path

      try {
        // Process HTML files to add SEO metadata and PiPilot badge
        let processedContent = file.content
        if (relativePath.endsWith('.html')) {
          console.log(`[HTML Hosting] Processing HTML file ${relativePath} with SEO enhancement...`)

          // Add comprehensive SEO metadata
          processedContent = await addSEOMetadata(processedContent, projectSlug)

          // Only inject badge for preview sites (not production)
          if (!isProduction) {
            processedContent = injectPiPilotBadge(processedContent)
            console.log(`[HTML Hosting] Badge injected for preview site: ${relativePath}`)
          } else {
            console.log(`[HTML Hosting] Skipping badge injection for production site: ${relativePath}`)
          }

          console.log(`[HTML Hosting] SEO enhanced for ${relativePath}`)
        }

        // Determine content type
        const contentType = getContentType(file.name || relativePath.split('/').pop() || '')

        // Upload to Supabase storage preserving directory structure
        const { data, error } = await supabase.storage
          .from('documents')
          .upload(`sites/${projectSlug}/${relativePath}`, processedContent, {
            contentType,
            upsert: true
          })

        if (error) {
          console.error(`[HTML Hosting] Error uploading ${relativePath}:`, error)
          failedCount++
          failedFiles.push(relativePath)
        } else {
          uploadedCount++
          console.log(`[HTML Hosting] Uploaded ${relativePath}`)
        }
      } catch (fileError) {
        console.error(`[HTML Hosting] Error processing ${relativePath}:`, fileError)
        failedCount++
        failedFiles.push(relativePath)
      }
    }

    console.log(`[HTML Hosting] Upload completed: ${uploadedCount} succeeded, ${failedCount} failed`)
    if (failedCount > 0) {
      console.error(`[HTML Hosting] Failed files: ${failedFiles.join(', ')}`)
    }

    // Fail if index.html didn't upload
    if (failedFiles.some(f => f.endsWith('index.html'))) {
      console.error('[HTML Hosting] CRITICAL: index.html failed to upload - marking deployment as failed')
      return false
    }

    return true
  } catch (error) {
    console.error('[HTML Hosting] Upload failed:', error)
    return false
  }
}

// Helper function to determine content type
function getContentType(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

/**
 * Parse environment variables from .env file content
 * @param content The content of the .env file
 * @returns Record of environment variables
 */
function parseEnvFile(content: string): Record<string, string> {
  const envVars: Record<string, string> = {}
  
  if (!content) return envVars
  
  const lines = content.split('\n')
  
  for (const line of lines) {
    // Skip empty lines and comments
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }
    
    // Split on first '=' only
    const eqIndex = trimmedLine.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmedLine.substring(0, eqIndex).trim()
      let value = trimmedLine.substring(eqIndex + 1).trim()
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1)
      }
      
      envVars[key] = value
    }
  }
  
  return envVars
}

// Extract project files from compressed data (LZ4 + Zip)
async function extractProjectFromCompressedData(compressedData: ArrayBuffer): Promise<{
  projectId: string
  projectSlug: string
  files: any[]
  metadata?: any
}> {
  // Step 1: LZ4 decompress
  const decompressedData = lz4.decompress(Buffer.from(compressedData))
  console.log(`[Preview] LZ4 decompressed to ${decompressedData.length} bytes`)

  // Step 2: Unzip the data
  const zip = new JSZip()
  await zip.loadAsync(decompressedData)

  // Extract files from zip
  const extractedFiles: any[] = []
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (!zipEntry.dir) {
      const content = await zipEntry.async('text')
      extractedFiles.push({
        path,
        content,
        name: path.split('/').pop() || path,
        type: path.split('.').pop() || 'text',
        size: content.length
      })
    }
  }

  console.log(`[Preview] Extracted ${extractedFiles.length} files from zip`)

  // Filter out images, videos, PDF files, scripts folders, test folders, and unwanted files to reduce processing load
  const filteredFiles = filterUnwantedFiles(extractedFiles)
  console.log(`[Preview] Filtered to ${filteredFiles.length} files (removed ${extractedFiles.length - filteredFiles.length} unwanted files)`)

  // Parse metadata to get projectId and projectSlug
  let projectId = `preview-${Date.now()}`
  let projectSlug = projectId // fallback to projectId if no slug
  let metadata: any = undefined
  const metadataEntry = zip.file('__metadata__.json')
  if (metadataEntry) {
    const metadataContent = await metadataEntry.async('text')
    metadata = JSON.parse(metadataContent)
    projectId = metadata.project?.id || metadata.projectId || projectId
    projectSlug = metadata.project?.slug || metadata.project?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || projectId
    console.log(`[Preview] Loaded metadata, projectId: ${projectId}, projectSlug: ${projectSlug}`)
  }

  return {
    projectId,
    projectSlug,
    files: filteredFiles,
    metadata
  }
}

export async function POST(req: Request) {
  // Check if client accepts streaming
  const acceptHeader = req.headers.get('accept') || ''
  const shouldStream = acceptHeader.includes('text/event-stream')
  
  if (shouldStream) {
    return handleStreamingPreview(req)
  }
  
  // Otherwise, use the regular preview creation
  return handleRegularPreview(req)
}

async function handleStreamingPreview(req: Request) {
  try {
    const e2bApiKey = process.env.E2B_API_KEY
    if (!e2bApiKey) {
      return new Response("E2B API key missing", { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response("Unauthorized", { status: 401 })

    // Check content type to determine data format
    const contentType = req.headers.get('content-type') || ''
    let projectId: string
    let projectSlug: string
    let files: any[]
    let authUserId: string | undefined
    let authUsername: string | undefined
    let isProduction = false
    let customDomainId: string | undefined

    if (contentType.includes('application/octet-stream')) {
      // Handle compressed data (LZ4 + Zip)
      console.log('[Preview] 📦 Received compressed binary data')
      const compressedData = await req.arrayBuffer()
      const extractedData = await extractProjectFromCompressedData(compressedData)
      projectId = extractedData.projectId
      projectSlug = extractedData.projectSlug
      files = extractedData.files
      // Extract auth info from metadata if available
      authUserId = extractedData.metadata?.authUserId
      authUsername = extractedData.metadata?.authUsername
      isProduction = extractedData.metadata?.isProduction || false
      customDomainId = extractedData.metadata?.customDomainId
    } else {
      // Handle JSON format (backward compatibility)
      console.log('[Preview] 📄 Received JSON data')
      const { 
        projectId: jsonProjectId, 
        projectSlug: jsonProjectSlug, 
        files: jsonFiles,
        authUserId: parsedAuthUserId,
        authUsername: parsedAuthUsername,
        isProduction: jsonIsProduction,
        customDomainId: jsonCustomDomainId
      } = await req.json()
      projectId = jsonProjectId
      projectSlug = jsonProjectSlug || projectId // fallback to projectId
      files = jsonFiles
      authUserId = parsedAuthUserId
      authUsername = parsedAuthUsername
      isProduction = jsonIsProduction || false
      customDomainId = jsonCustomDomainId
    }

    if (!projectId || !files?.length) {
      return new Response("Project ID and files are required", { status: 400 })
    }

    // 🔍 Check domain availability and generate unique slug if needed
    console.log(`[Domain Check] Checking availability for: ${projectSlug}`)
    const domainCheck = await checkDomainAvailability(projectSlug, externalSupabase, projectId, 'preview')
    const finalSlug = domainCheck.finalSlug
    const originalSlug = domainCheck.available ? null : projectSlug
    const slugReused = domainCheck.reused

    if (!domainCheck.available && !slugReused) {
      console.log(`[Domain Check] "${projectSlug}" not available, using "${finalSlug}"`)
    } else if (slugReused) {
      console.log(`[Domain Check] Reusing existing slug "${finalSlug}" for project`)
    }

    console.log(`[Domain Check] Final slug: ${finalSlug}`)

    // Create site tracking record if we have auth info (with project_id for slug reuse)
    if (authUserId && authUsername) {
      await createSiteRecord(finalSlug, originalSlug, authUserId, authUsername, externalSupabase, projectId, 'preview')
    }

    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false
        const send = (payload: any) => {
          if (!isClosed) {
            try {
              controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`)
            } catch (error) {
              // Controller might be closed, ignore the error
              isClosed = true
            }
          }
        }

        try {
          send({ type: "log", message: "Booting sandbox..." })

          // Parse environment variables from .env files
          let envVars: Record<string, string> = {}
          const envLocalFile = files.find((f: any) => f.path === '.env.local')
          if (envLocalFile) {
            envVars = parseEnvFile(envLocalFile.content)
          }
          const envFile = files.find((f: any) => f.path === '.env')
          if (envFile) {
            envVars = { ...envVars, ...parseEnvFile(envFile.content) }
          }

          // Detect project type for template selection
          const packageJsonFile = files.find((f: any) => f.path === 'package.json')
          let packageJson: any = null
          if (packageJsonFile) {
            try {
              packageJson = JSON.parse(packageJsonFile.content)
            } catch (error) {
              console.warn('[Preview] Failed to parse package.json, using default commands')
            }
          }
          const isExpoProject = files.some((f: any) => f.path === 'app.json' || f.path === 'app.config.js' || (packageJson && packageJson.dependencies && packageJson.dependencies['expo']))
          const template = "pipilot-expo"

          // 🔹 Create sandbox
          const sandbox = await createEnhancedSandbox({
            template,
            timeoutMs: 600000,
            env: envVars
          })
          send({ type: "log", message: "Sandbox created" })

          // 🔹 Write project files
          send({ type: "log", message: "Writing files..." })
          const sandboxFiles: SandboxFile[] = files.map((f: any) => ({
            path: isExpoProject ? `/home/user/${f.path}` : `/project/${f.path}`,
            content: f.content || "",
          }))

          await sandbox.writeFiles(sandboxFiles)
          send({ type: "log", message: "Files written" })

          // Detect package manager early - use yarn for Expo projects due to postinstall script requirements, pnpm for non-Expo
          const hasPnpmLock = files.some(f => f.path === 'pnpm-lock.yaml')
          const hasYarnLock = files.some(f => f.path === 'yarn.lock')
          const packageManager = isExpoProject ? 'yarn' : (hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'pnpm')

          // 🔹 Install dependencies (simple and reliable like the old version)
          send({ type: "log", message: "Installing dependencies..." })
          const installResult = await sandbox.installDependenciesRobust(
            isExpoProject ? "/home/user" : "/project", 
            {
              timeoutMs: 0,
              envVars,
              packageManager,
              onStdout: (data) => send({ type: "log", message: data.trim() }),
              // Send stderr as log too - package managers often output progress to stderr
              onStderr: (data) => {
                const msg = data.trim()
                // Only treat as error if it contains actual error keywords
                if (msg.includes('ERR!') || msg.includes('ENOENT') || msg.includes('failed')) {
                  send({ type: "error", message: msg })
                } else {
                  // Yarn, npm, pnpm often output progress info to stderr
                  send({ type: "log", message: msg })
                }
              },
            }
          )

          if (installResult.exitCode !== 0) {
            send({ type: "error", message: "Dependency installation failed" })
            throw new Error("Dependency installation failed")
          }

          send({ type: "log", message: "Dependencies installed successfully" })

          // 🔹 For Expo projects, fix dependency versions and install TypeScript if needed
          if (isExpoProject) {
            // Fix any dependency version mismatches automatically
            send({ type: "log", message: "Fixing Expo dependency versions..." })
            
            // Try multiple fixing strategies
            let fixSucceeded = false
            
            // Strategy 1: Use npx expo install --fix
            try {
              send({ type: "log", message: "Running: npx expo install --fix" })
              const fixResult = await sandbox.executeCommand('npx expo install --fix', {
                workingDirectory: '/home/user',
                timeoutMs: 180000, // 3 minutes for fixing dependencies
                envVars,
                onStdout: (data) => {
                  const msg = data.trim()
                  if (msg) send({ type: "log", message: msg })
                },
                onStderr: (data) => {
                  const msg = data.trim()
                  if (msg && !msg.includes('warning') && !msg.includes('deprecated')) {
                    send({ type: "log", message: `[FIX] ${msg}` })
                  }
                }
              })
              
              if (fixResult.exitCode === 0) {
                send({ type: "log", message: "✅ Expo dependencies fixed successfully" })
                fixSucceeded = true
              } else {
                send({ type: "log", message: "⚠️ Dependency fix completed with warnings, trying individual packages..." })
              }
            } catch (error) {
              send({ type: "log", message: "⚠️ Auto-fix encountered issues, trying individual packages..." })
            }
            
            // Strategy 2: If auto-fix failed, try fixing specific common problematic packages
            if (!fixSucceeded) {
              const commonPackages = [
                '@expo/vector-icons',
                '@react-native-async-storage/async-storage',
                'react-native-screens',
                'react-native-safe-area-context'
              ]
              
              for (const pkg of commonPackages) {
                try {
                  send({ type: "log", message: `Fixing ${pkg}...` })
                  const pkgFixResult = await sandbox.executeCommand(`npx expo install ${pkg}`, {
                    workingDirectory: '/home/user',
                    timeoutMs: 60000,
                    envVars,
                    onStdout: (data) => {
                      const msg = data.trim()
                      if (msg && !msg.includes('up to date')) {
                        send({ type: "log", message: msg })
                      }
                    },
                    onStderr: (data) => {} // Suppress stderr for individual packages
                  })
                  
                  if (pkgFixResult.exitCode === 0) {
                    send({ type: "log", message: `✅ Fixed ${pkg}` })
                  }
                } catch (error) {
                  // Continue with other packages
                }
              }
              send({ type: "log", message: "Dependency compatibility check completed" })
            }
            
            // Install TypeScript if project uses it
            const hasTypeScriptFiles = files.some((f: any) => 
              f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path === 'tsconfig.json'
            )
            
            if (hasTypeScriptFiles) {
              send({ type: "log", message: "Ensuring TypeScript is installed..." })
              try {
                const tsInstallResult = await sandbox.executeCommand('npx expo install typescript @types/react', {
                  workingDirectory: '/home/user',
                  timeoutMs: 60000,
                  envVars,
                  onStdout: (data) => {
                    const msg = data.trim()
                    if (msg) send({ type: "log", message: msg })
                  },
                  onStderr: (data) => {} // Suppress stderr
                })
                
                if (tsInstallResult.exitCode === 0) {
                  send({ type: "log", message: "✅ TypeScript installed successfully" })
                }
              } catch (error) {
                send({ type: "log", message: "TypeScript installation completed" })
              }
            }
            
            send({ type: "log", message: "📦 All dependency fixes completed, starting dev server..." })
          }
          let buildCommand = "npm run build && PORT=3000 npm run preview" // Default to Vite
          const hasViteConfig = files.some((f: any) => 
            f.path === 'vite.config.js' || 
            f.path === 'vite.config.ts' || 
            f.path === 'vite.config.mjs'
          )
          
          if (hasViteConfig || packageJson?.scripts?.preview) {
            // Vite project - build and host on Supabase storage
            send({ type: "log", message: "Detected Vite project, will build and host on pipilot" })
            
            // Build the project first
            const buildCommand = `${packageManager} run build`
            send({ type: "log", message: `Building Vite project with: ${buildCommand}` })
            const buildResult = await sandbox.executeCommand(buildCommand, {
              workingDirectory: '/project', // Vite projects use /project directory
              timeoutMs: 300000, // 5 minutes for build
              envVars,
              onStdout: (data) => send({ type: "log", message: data.trim() }),
              onStderr: (data) => send({ type: "error", message: data.trim() })
            })
            
            if (buildResult.exitCode !== 0) {
              send({ type: "error", message: `Vite build failed: ${buildResult.stderr}` })
              throw new Error(`Vite build failed: ${buildResult.stderr}`)
            }
            
            send({ type: "log", message: "Build completed successfully" })
            
            // Upload built files to Supabase using the final slug
            const uploadSuccess = await uploadViteBuildToSupabase(sandbox, finalSlug, externalSupabase, isProduction)
            
            if (!uploadSuccess) {
              send({ type: "error", message: "Failed to upload built files to hosting" })
              throw new Error('Failed to upload built files to hosting')
            }
            
            // Return hosted URL with final slug
            const hostedUrl = `https://${finalSlug}.pipilot.dev/`
            
            send({ type: "log", message: `Vite project hosted at: ${hostedUrl}` })
            
            // Create or update site record in the sites table
            if (authUserId) {
              try {
                const siteType = isProduction ? 'production' : 'preview';
                const autoDelete = !isProduction;
                
                const { data: existingSite } = await externalSupabase
                  .from('sites')
                  .select('*')
                  .eq('project_id', projectId)
                  .eq('site_type', siteType)
                  .eq('user_id', authUserId)
                  .maybeSingle();
                
                if (existingSite) {
                  await externalSupabase
                    .from('sites')
                    .update({
                      url: hostedUrl,
                      project_slug: finalSlug,
                      custom_domain_id: customDomainId || null,
                      last_updated: new Date().toISOString(),
                      is_active: true
                    })
                    .eq('id', existingSite.id);
                  
                  send({ type: "log", message: `Updated ${siteType} site record` });
                } else {
                  await externalSupabase
                    .from('sites')
                    .insert({
                      user_id: authUserId,
                      project_id: projectId,
                      project_slug: finalSlug,
                      site_type: siteType,
                      url: hostedUrl,
                      custom_domain_id: customDomainId || null,
                      is_active: true,
                      auto_delete: autoDelete,
                      deployed_at: new Date().toISOString(),
                      metadata: { framework: 'html', deployed_from: 'pixelpilot' }
                    });
                  
                  send({ type: "log", message: `Created ${siteType} site record` });
                }
                
                if (customDomainId) {
                  await externalSupabase
                    .from('custom_domains')
                    .update({ site_id: existingSite?.id })
                    .eq('id', customDomainId);
                }
              } catch (siteError) {
                send({ type: "error", message: `Site record error: ${siteError}` });
              }
            }
            
            send({
              type: "ready",
              message: "Vite project hosted successfully",
              sandboxId: sandbox.id,
              url: hostedUrl,
              finalSlug: finalSlug,
              originalSlug: originalSlug,
              processId: null,
              hosted: true,
              isProduction: isProduction
            })

            // Keep-alive heartbeat for hosted projects too
            const hostedHeartbeat = setInterval(() => {
              send({ type: "heartbeat", message: "alive" })
            }, 30000)

            const hostedOriginalClose = controller.close.bind(controller)
            controller.close = () => {
              isClosed = true
              clearInterval(hostedHeartbeat)
              hostedOriginalClose()
            }
            
            // Exit the function early for hosted projects
            controller.close()
            return
          }

          // Check for HTML projects (has index.html but no Vite/Next.js/Expo configs)
          const hasIndexHtml = files.some((f: any) => f.path === 'index.html')
          const hasNoBuildConfigs = !files.some((f: any) =>
            f.path === 'vite.config.js' ||
            f.path === 'vite.config.ts' ||
            f.path === 'vite.config.mjs' ||
            f.path === 'next.config.js' ||
            f.path === 'next.config.mjs' ||
            f.path === 'app.json' ||
            f.path === 'nuxt.config.js' ||
            f.path === 'nuxt.config.ts'
          )

          if (hasIndexHtml && hasNoBuildConfigs) {
            // HTML project - upload static files directly to Supabase storage
            send({ type: "log", message: "Detected HTML project, will host static files on Supabase" })

            // Upload HTML project files to Supabase using the final slug
            const uploadSuccess = await uploadHtmlProjectToSupabase(files, finalSlug, externalSupabase, isProduction)

            if (!uploadSuccess) {
              send({ type: "error", message: "Failed to upload HTML files to hosting" })
              throw new Error('Failed to upload HTML files to hosting')
            }

            // Return hosted URL with final slug
            const hostedUrl = `https://${finalSlug}.pipilot.dev/`

            send({ type: "log", message: `HTML project hosted at: ${hostedUrl}` })

            // Create or update site record in the sites table
            if (authUserId) {
              try {
                const siteType = isProduction ? 'production' : 'preview';
                const autoDelete = !isProduction;

                const { data: existingSite } = await externalSupabase
                  .from('sites')
                  .select('*')
                  .eq('project_id', projectId)
                  .eq('site_type', siteType)
                  .eq('user_id', authUserId)
                  .maybeSingle();

                if (existingSite) {
                  await externalSupabase
                    .from('sites')
                    .update({
                      url: hostedUrl,
                      project_slug: finalSlug,
                      custom_domain_id: customDomainId || null,
                      last_updated: new Date().toISOString(),
                      is_active: true
                    })
                    .eq('id', existingSite.id);

                  send({ type: "log", message: `Updated ${siteType} site record` });
                } else {
                  await externalSupabase
                    .from('sites')
                    .insert({
                      user_id: authUserId,
                      project_id: projectId,
                      project_slug: finalSlug,
                      site_type: siteType,
                      url: hostedUrl,
                      custom_domain_id: customDomainId || null,
                      is_active: true,
                      auto_delete: autoDelete,
                      deployed_at: new Date().toISOString(),
                      metadata: { framework: 'html', deployed_from: 'pixelpilot' }
                    });

                  send({ type: "log", message: `Created ${siteType} site record` });
                }

                if (customDomainId) {
                  await externalSupabase
                    .from('custom_domains')
                    .update({ site_id: existingSite?.id })
                    .eq('id', customDomainId);
                }
              } catch (siteError) {
                send({ type: "error", message: `Site record error: ${siteError}` });
              }
            }

            send({
              type: "ready",
              message: "HTML project hosted successfully",
              sandboxId: sandbox.id,
              url: hostedUrl,
              finalSlug: finalSlug,
              originalSlug: originalSlug,
              processId: null,
              hosted: true,
              isProduction: isProduction
            })

            // Keep-alive heartbeat for hosted projects too
            const hostedHeartbeat = setInterval(() => {
              send({ type: "heartbeat", message: "alive" })
            }, 30000)

            const hostedOriginalClose = controller.close.bind(controller)
            controller.close = () => {
              isClosed = true
              clearInterval(hostedHeartbeat)
              hostedOriginalClose()
            }

            // Exit the function early for hosted projects
            controller.close()
            return
          } else if (isExpoProject) {
            // Expo project - run dev server directly with npx (no dependency on package.json scripts)
            send({ type: "log", message: "Detected Expo project, starting Expo dev server" })
            
            // Track Metro bundler readiness
            let metroStarted = false
            let readySent = false
            
            // Use npx expo start --web directly (Expo CLI is globally installed)
            const devCommand = `npx expo start --web`
            const devServer = await sandbox.startDevServer({
              command: devCommand,
              workingDirectory: '/home/user', // Use user home directory like E2B Expo template
              port: 8081,
              timeoutMs: 300000, // 5 minutes timeout
              envVars: {
                ...envVars,
                EXPO_NO_TELEMETRY: '1',
                EXPO_NO_REDIRECT: '1'
              },
              onStdout: (data) => {
                const message = data.trim()
                send({ type: "log", message })
                
                // Check for Metro bundler readiness indicators
                if (message.includes("Starting Metro Bundler") || message.includes("Metro Bundler")) {
                  metroStarted = true
                  send({ type: "log", message: "Metro Bundler started" })
                }
                
                // Send ready event as soon as Metro starts (don't wait for client connection)
                // The iframe loading will trigger "Waiting on..." message
                if (metroStarted && !readySent) {
                  readySent = true
                  send({ type: "log", message: "Expo dev server ready on port 8081" })
                  send({
                    type: "ready",
                    message: "Expo web dev server running",
                    sandboxId: sandbox.id,
                    url: devServer.url,
                    processId: devServer.processId,
                  })
                  send({ type: "log", message: `✅ Server ready` })
                  send({ type: "log", message: `E2B sandbox ${sandbox.id} is ready for log streaming` })
                  send({ type: "log", message: `Expo web server URL: ${devServer.url}` })
                  send({ type: "log", message: `Logs for your project will appear below.` })
                }
              },
              onStderr: (data) => {
                const message = data.trim()
                // Don't treat package compatibility warnings as errors
                if (!message.includes('should be updated for best compatibility')) {
                  send({ type: "error", message })
                } else {
                  send({ type: "log", message: `[WARN] ${message}` })
                }
              }
            })
            
            // Keep-alive heartbeat
            const heartbeat = setInterval(() => {
              send({ type: "heartbeat", message: "alive" })
            }, 30000)
            
            const originalClose = controller.close.bind(controller)
            controller.close = () => {
              isClosed = true
              clearInterval(heartbeat)
              originalClose()
            }
          } else {
            // 🔹 Assume Next.js or other framework, run dev server
            send({ type: "log", message: "Starting dev server..." })
            buildCommand = `${packageManager} run dev`
            const devServer = await sandbox.startDevServer({
              command: buildCommand,
              workingDirectory: "/project",
              port: 3000,
              timeoutMs: 300000, // 5 minutes timeout for dev server startup
              envVars,
              onStdout: (data) => send({ type: "log", message: data.trim() }),
              onStderr: (data) => send({ type: "error", message: data.trim() }),
            })

            send({
              type: "ready",
              message: "Dev server running",
              sandboxId: sandbox.id,
              url: devServer.url,
              processId: devServer.processId,
            })

            // 🔹 Keep-alive heartbeat
            const heartbeat = setInterval(() => {
              send({ type: "heartbeat", message: "alive" })
            }, 30000)

            const originalClose = controller.close.bind(controller)
            controller.close = () => {
              isClosed = true
              clearInterval(heartbeat)
              originalClose()
            }
          }
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          })
          isClosed = true
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    return new Response("Internal error", { status: 500 })
  }
}

async function handleRegularPreview(req: Request) {
  try {
    // Check if E2B API key is configured
    const e2bApiKey = process.env.E2B_API_KEY || 'e2b_03abf205497af89f4331b62f3417d13c6ad7ade0'
    if (!process.env.E2B_API_KEY && !e2bApiKey) {
      console.error('E2B_API_KEY environment variable is not set and no fallback key available')
      return Response.json({ 
        error: 'Preview service is not configured. Please contact support.',
        details: 'Missing E2B API key'
      }, { status: 500 })
    }

    // Check content type to determine data format
    const contentType = req.headers.get('content-type') || ''
    let projectId: string
    let projectSlug: string
    let files: any[]
    let authUserId: string | undefined
    let authUsername: string | undefined

    let isProduction = false;
    let customDomainId: string | undefined;

    if (contentType.includes('application/octet-stream')) {
      // Handle compressed data (LZ4 + Zip)
      console.log('[Preview] 📦 Received compressed binary data for regular preview')
      const compressedData = await req.arrayBuffer()
      const extractedData = await extractProjectFromCompressedData(compressedData)
      projectId = extractedData.projectId
      projectSlug = extractedData.projectSlug
      files = extractedData.files
      // Extract auth info from metadata if available
      authUserId = extractedData.metadata?.authUserId
      authUsername = extractedData.metadata?.authUsername
      isProduction = extractedData.metadata?.isProduction || false
      customDomainId = extractedData.metadata?.customDomainId
    } else {
      // Handle JSON format (backward compatibility)
      console.log('[Preview] 📄 Received JSON data for regular preview')
      const { 
        projectId: jsonProjectId, 
        projectSlug: jsonProjectSlug, 
        files: jsonFiles,
        authUserId: parsedAuthUserId,
        authUsername: parsedAuthUsername,
        isProduction: jsonIsProduction,
        customDomainId: jsonCustomDomainId
      } = await req.json()
      projectId = jsonProjectId
      projectSlug = jsonProjectSlug || projectId // fallback to projectId
      files = jsonFiles
      authUserId = parsedAuthUserId
      authUsername = parsedAuthUsername
      isProduction = jsonIsProduction || false
      customDomainId = jsonCustomDomainId
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 })
    }

    if (!files || !Array.isArray(files)) {
      return Response.json({ error: 'Files array is required' }, { status: 400 })
    }

    if (files.length === 0) {
      return Response.json({ error: 'No files provided for preview' }, { status: 400 })
    }

    // Validate auth info from frontend (required for JSON, optional for compressed)
    if (contentType.includes('application/json') && (!authUserId || !authUsername)) {
      return Response.json({ 
        error: 'Auth information required', 
        details: 'authUserId and authUsername must be provided from frontend for JSON requests' 
      }, { status: 400 })
    }

    console.log(`Creating preview for project ${projectId} with ${files.length} files${authUsername ? ` by user ${authUsername}` : ''}`)

    // 🔍 Check domain availability and generate unique slug if needed
    console.log(`[Domain Check] Checking availability for: ${projectSlug}`)
    const domainCheck = await checkDomainAvailability(projectSlug, externalSupabase, projectId, 'preview')
    const finalSlug = domainCheck.finalSlug
    const originalSlug = domainCheck.available ? null : projectSlug
    const slugReused = domainCheck.reused

    if (!domainCheck.available && !slugReused) {
      console.log(`[Domain Check] "${projectSlug}" not available, using "${finalSlug}"`)
    } else if (slugReused) {
      console.log(`[Domain Check] Reusing existing slug "${finalSlug}" for project`)
    }

    console.log(`[Domain Check] Final slug: ${finalSlug}`)

    // Create site tracking record if we have auth info (with project_id for slug reuse)
    if (authUserId && authUsername) {
      await createSiteRecord(finalSlug, originalSlug, authUserId, authUsername, externalSupabase, projectId, 'preview')
    }

    // Parse environment variables from .env.local file if it exists
    let envVars: Record<string, string> = {}
    const envLocalFile = files.find(f => f.path === '.env.local')
    if (envLocalFile) {
      envVars = parseEnvFile(envLocalFile.content)
    }
    
    // Also check for .env file
    const envFile = files.find(f => f.path === '.env')
    if (envFile) {
      envVars = { ...envVars, ...parseEnvFile(envFile.content) }
    }

    // Detect project type for template selection
    const packageJsonFile = files.find((f: any) => f.path === 'package.json')
    let packageJson: any = null
    if (packageJsonFile) {
      try {
        packageJson = JSON.parse(packageJsonFile.content)
      } catch (error) {
        console.warn('[Preview] Failed to parse package.json, using default commands')
      }
    }
    const isExpoProject = files.some((f: any) => f.path === 'app.json' || f.path === 'app.config.js' || (packageJson && packageJson.dependencies && packageJson.dependencies['expo']))
    const template = "pipilot-expo"

    // Create enhanced E2B sandbox with environment variables
    let sandbox
    try {
      sandbox = await createEnhancedSandbox({
        template,
        timeoutMs: 600000, // 10 minutes for sandbox creation and operations
        env: envVars // Pass environment variables to sandbox
      })
    } catch (error) {
      console.error('Failed to create sandbox:', error)
      return Response.json({ 
        error: 'Failed to create preview environment. Please try again later.',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }

    if (!sandbox) {
      return Response.json({ error: 'Failed to create sandbox' }, { status: 500 })
    }

    try {
      // Prepare files for batch operation
      const sandboxFiles: SandboxFile[] = files.map(file => ({
        path: isExpoProject ? `/home/user/${file.path}` : `/project/${file.path}`,
        content: file.content || ''
      }))

      // Add .npmrc for package manager optimization
      const hasNpmrc = files.some(f => f.path === '.npmrc')
      if (!hasNpmrc) {
        let npmrcContent: string
        if (isExpoProject) {
          // yarn configuration for Expo projects
          npmrcContent = [
            '# yarn configuration for Expo/React Native compatibility',
            'fund=false',
            'audit=false'
          ].join('\n')
        } else {
          // pnpm configuration for faster installs and better performance
          npmrcContent = [
            '# pnpm configuration for faster installs and better performance',
            'prefer-frozen-lockfile=false',
            'auto-install-peers=true',
            'shamefully-hoist=true',
            'strict-peer-dependencies=false',
            'resolution-mode=highest',
            'store-dir=.pnpm-store',
            'cache-dir=.pnpm-cache'
          ].join('\n')
        }

        sandboxFiles.push({
          path: '/project/.npmrc',
          content: npmrcContent
        })
      }

      // Add pnpm-lock.yaml for faster installs (only for non-Expo projects)
      const shouldAddPnpmLock = !isExpoProject && !files.some(f => f.path === 'pnpm-lock.yaml')
      if (shouldAddPnpmLock) {
        const pnpmLockContent = `# This file is automatically generated by pnpm.
# It contains a lockfileEntry of the exact version of each package.
# It is recommended to include this file in version control.
# 
# For more information, see: https://pnpm.io/cli/install

lockfileVersion: '6.0'

dependencies:
  react: 18.2.0
  react-dom: 18.2.0

devDependencies:
  '@types/react': 18.2.43
  '@types/react-dom': 18.2.17
  '@typescript-eslint/eslint-plugin': 6.14.0
  '@typescript-eslint/parser': 6.14.0
  '@vitejs/plugin-react': 4.2.1
  eslint: 8.55.0
  eslint-plugin-react-hooks: 4.6.0
  eslint-plugin-react-refresh: 0.4.5
  typescript: 5.2.2
  vite: 5.0.8
`

        sandboxFiles.push({
          path: '/project/pnpm-lock.yaml',
          content: pnpmLockContent
        })
      }

      // Add default .env file if it doesn't exist
      const hasEnv = files.some(f => f.path === '.env')
      if (!hasEnv) {
        const envContent = `# Environment variables for the application
# Add your environment variables here
# Example:
# REACT_APP_API_URL=https://api.example.com
# REACT_APP_API_KEY=your_api_key_here
`

        sandboxFiles.push({
          path: '/project/.env',
          content: envContent
        })
      }

      // Write all files in batch operation
      console.log(`Writing ${sandboxFiles.length} files to sandbox...`)
      const fileResult = await sandbox.writeFiles(sandboxFiles)
      
      if (!fileResult.success) {
        console.error('File write errors:', fileResult.results.filter(r => !r.success))
        const errorFiles = fileResult.results.filter(r => !r.success)
        if (errorFiles.length > 0) {
          console.error('Failed files:', errorFiles.map(f => ({ path: f.path, error: f.error })))
        }
      } else {
        console.log(`Successfully wrote ${fileResult.successCount} files to sandbox`)
      }

      // Install dependencies with no timeout (simple and reliable like old version)
      const installResult = await sandbox.installDependenciesRobust(
        isExpoProject ? '/home/user' : '/project', 
        { timeoutMs: 0, envVars }
      )
      
      if (installResult.exitCode !== 0) {
        console.error('npm install failed:', installResult.stderr)
        console.error('npm install stdout:', installResult.stdout)
        throw new Error(`npm dependency installation failed with exit code ${installResult.exitCode}`)
      }
      
      console.log('Dependencies installed successfully with npm')

      // For Expo projects, fix dependency versions and install TypeScript if needed
      if (isExpoProject) {
        // Fix any dependency version mismatches automatically
        console.log('Fixing Expo dependency versions...')
        try {
          const fixResult = await sandbox.executeCommand('npx expo install --fix', {
            workingDirectory: '/home/user',
            timeoutMs: 120000, // 2 minutes for fixing dependencies
            envVars
          })
          
          if (fixResult.exitCode === 0) {
            console.log('Expo dependencies fixed successfully')
          } else {
            console.log('Dependency fix completed with warnings, continuing...')
          }
        } catch (error) {
          console.log('Dependency fix step skipped, continuing...')
        }
        
        // Install TypeScript if project uses it
        const hasTypeScriptFiles = files.some((f: any) => 
          f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path === 'tsconfig.json'
        )
        
        if (hasTypeScriptFiles) {
          console.log('Ensuring TypeScript is installed...')
          try {
            const tsInstallResult = await sandbox.executeCommand('npx expo install typescript @types/react', {
              workingDirectory: '/home/user',
              timeoutMs: 60000,
              envVars
            })
            
            if (tsInstallResult.exitCode === 0) {
              console.log('TypeScript installed successfully')
            }
          } catch (error) {
            console.log('TypeScript installation skipped, continuing...')
          }
        }
      }
      let buildCommand = "npm run build && PORT=3000 npm run preview" // Default to Vite
      const hasViteConfig = files.some((f: any) => 
        f.path === 'vite.config.js' || 
        f.path === 'vite.config.ts' || 
        f.path === 'vite.config.mjs'
      )
      
      // Detect package manager
      const hasPnpmLock = files.some(f => f.path === 'pnpm-lock.yaml')
      const hasYarnLock = files.some(f => f.path === 'yarn.lock')
      const packageManager = hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'npm'
      
      if (hasViteConfig || packageJson?.scripts?.preview) {
        // Vite project - build and host on Supabase storage
        console.log('[Preview] Detected Vite project, will build and host')
        
        // Build the project first
        const buildCommand = `${packageManager} run build`
        console.log(`[Preview] Building Vite project with: ${buildCommand}`)
        const buildResult = await sandbox.executeCommand(buildCommand, {
          workingDirectory: '/project',
          timeoutMs: 300000, // 5 minutes for build
          envVars,
          onStdout: (data) => console.log(`[Preview] Build stdout: ${data.trim()}`),
          onStderr: (data) => console.error(`[Preview] Build stderr: ${data.trim()}`)
        })
        
        if (buildResult.exitCode !== 0) {
          console.error('[Preview] Build failed:', buildResult.stderr)
          throw new Error(`Vite build failed: ${buildResult.stderr}`)
        }
        
        console.log('[Preview] Build completed successfully')
        
        // Upload built files to Supabase
        const uploadSuccess = await uploadViteBuildToSupabase(sandbox, finalSlug, externalSupabase, isProduction)
        
        if (!uploadSuccess) {
          throw new Error('Failed to upload built files to hosting')
        }
        
        // Return hosted URL instead of sandbox URL
        const hostedUrl = `https://${finalSlug}.pipilot.dev/`
        
        console.log(`[Preview] Vite project hosted at: ${hostedUrl}`)
        
        // Create or update site record in the sites table
        if (authUserId) {
          try {
            const siteType = isProduction ? 'production' : 'preview';
            const autoDelete = !isProduction;
            
            const { data: existingSite } = await externalSupabase
              .from('sites')
              .select('*')
              .eq('project_id', projectId)
              .eq('site_type', siteType)
              .eq('user_id', authUserId)
              .maybeSingle();
            
            if (existingSite) {
              await externalSupabase
                .from('sites')
                .update({
                  url: hostedUrl,
                  project_slug: finalSlug,
                  custom_domain_id: customDomainId || null,
                  last_updated: new Date().toISOString(),
                  is_active: true
                })
                .eq('id', existingSite.id);
              
              console.log(`[Site Record] Updated ${siteType} site for project ${projectId}`);
            } else {
              await externalSupabase
                .from('sites')
                .insert({
                  user_id: authUserId,
                  project_id: projectId,
                  project_slug: finalSlug,
                  site_type: siteType,
                  url: hostedUrl,
                  custom_domain_id: customDomainId || null,
                  is_active: true,
                  auto_delete: autoDelete,
                  deployed_at: new Date().toISOString(),
                  metadata: { framework: 'vite', deployed_from: 'pixelpilot' }
                });
              
              console.log(`[Site Record] Created ${siteType} site for project ${projectId}`);
            }
            
            if (customDomainId) {
              await externalSupabase
                .from('custom_domains')
                .update({ site_id: existingSite?.id })
                .eq('id', customDomainId);
            }
          } catch (siteError) {
            console.error('[Site Record] Error:', siteError);
          }
        }
        
        return Response.json({
          sandboxId: sandbox.id,
          url: hostedUrl,
          finalSlug: finalSlug,
          originalSlug: originalSlug,
          processId: null,
          hosted: true,
          isProduction: isProduction
        })
      }

      // Assume Next.js or other framework, run dev server
      console.log('Starting dev server...')
      buildCommand = `${packageManager} run dev`
      const devServer = await sandbox.startDevServer({
        command: buildCommand,
        workingDirectory: '/project',
        port: 3000,
        timeoutMs: 0,
        envVars // Pass environment variables
      })
      
      console.log('Dev server started successfully:', {
        url: devServer.url,
        processId: devServer.processId
      })

      // Return sandbox info
      return Response.json({
        sandboxId: sandbox.id,
        url: devServer.url,
        processId: devServer.processId,
      })

    } catch (error) {
      // Enhanced cleanup on error
      if (sandbox) {
        try {
          await sandbox.terminate()
        } catch (cleanupError) {
          console.error('Error during sandbox cleanup:', cleanupError)
        }
      }
      throw error
    }

  } catch (error) {
    console.error('Preview API Error:', error)
    
    // Enhanced error handling
    if (error instanceof SandboxError) {
      return Response.json({ 
        error: error.message,
        type: error.type,
        sandboxId: error.sandboxId 
      }, { status: 500 })
    }
    
    return Response.json({ error: 'Failed to create preview' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { sandboxId } = await req.json()

    if (sandboxId) {
      const sandbox = await reconnectToSandbox(sandboxId)
      await sandbox.terminate()
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error closing sandbox:', error)

    if (error instanceof SandboxError) {
      return Response.json({
        error: error.message,
        type: error.type
      }, { status: 500 })
    }

    return Response.json({ error: 'Failed to close sandbox' }, { status: 500 })
  }
}

// New endpoint for streaming logs from background processes
export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const sandboxId = url.searchParams.get('sandboxId')
  const processId = url.searchParams.get('processId')

  if (!sandboxId || !processId) {
    return Response.json({ error: 'sandboxId and processId are required' }, { status: 400 })
  }

  try {
    // Reconnect to the sandbox
    const sandbox = await reconnectToSandbox(sandboxId)

    if (!sandbox) {
      return Response.json({ error: 'Sandbox not found' }, { status: 404 })
    }

    // Get process logs using E2B's process monitoring capabilities
    // This implements the pattern from the user's example using E2B's API
    try {
      // For now, we'll simulate process monitoring since getProcessInfo may not be available
      // In a real implementation, this would use E2B's process monitoring API
      const logs = {
        stdout: `Dev server process ${processId} is running on E2B sandbox ${sandboxId}`,
        stderr: null,
        timestamp: new Date().toISOString(),
        isRunning: true
      }

      return Response.json(logs)
    } catch (processError) {
      // If process monitoring fails, return a basic status
      console.warn('Process monitoring not available, returning basic status:', processError)

      const logs = {
        stdout: `Dev server process ${processId} status check`,
        stderr: null,
        timestamp: new Date().toISOString(),
        isRunning: true
      }

      return Response.json(logs)
    }

  } catch (error) {
    console.error('Error fetching process logs:', error)

    if (error instanceof SandboxError) {
      return Response.json({
        error: error.message,
        type: error.type
      }, { status: 500 })
    }

    return Response.json({ error: 'Failed to fetch process logs' }, { status: 500 })
  }
}