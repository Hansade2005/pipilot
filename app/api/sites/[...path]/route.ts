import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createExternalClient } from '@supabase/supabase-js'
import { trackSiteView } from '@/app/api/preview/route'

// Supabase configuration for sites storage
const SUPABASE_CONFIG = {
  URL: "https://dlunpilhklsgvkegnnlp.supabase.co",
  SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdW5waWxoa2xzZ3ZrZWdubmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA1MDQxOSwiZXhwIjoyMDcwNjI2NDE5fQ.k-2OJ4p3hr9feR4ks54OQM2HhOhaVJ3pUK-20tGJwpo",
};

// Extract subdomain from hostname for multi-tenant routing
function getSubdomain(hostname: string): string | null {
  // Remove port if present
  const host = hostname.split(':')[0];

  // For local development, treat localhost as no subdomain
  if (host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  // Split by dots and check if we have a subdomain
  const parts = host.split('.');

  // If we have more than 2 parts and it's not an IP, we have a subdomain
  // e.g., subscontrol.pipilot.dev -> ['subscontrol', 'pipilot', 'dev']
  if (parts.length > 2 && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return parts[0]; // Return the first part as subdomain
  }

  return null; // No subdomain
}

function detectContentType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

// Handle multi-tenant subdomain routing for root requests
export async function GET(request: NextRequest) {
  try {
    const hostname = request.headers.get('host') || '';
    const url = new URL(request.url);
    
    // Parse the path - it will be /api/sites/siteId/path
    const pathSegments = url.pathname.split('/').filter(Boolean);
    // pathSegments = ['api', 'sites', 'siteId', ...rest]
    
    // Extract subdomain for multi-tenant routing
    const subdomain = getSubdomain(hostname);

    let siteId: string;
    let filePath: string;

    if (subdomain) {
      // Multi-tenant mode: subdomain.pipilot.dev/path -> serve from sites/subdomain/path
      siteId = subdomain;
      // Path after /api/sites/siteId
      const pathIndex = pathSegments.indexOf('sites');
      if (pathIndex >= 0 && pathSegments[pathIndex + 1] === siteId) {
        filePath = pathSegments.slice(pathIndex + 2).join('/') || 'index.html';
      } else {
        filePath = pathSegments.slice(pathIndex + 1).join('/') || 'index.html';
      }
    } else {
      // Direct API access: /api/sites/siteId/path
      const pathIndex = pathSegments.indexOf('sites');
      if (pathIndex < 0 || pathSegments.length < pathIndex + 2) {
        return NextResponse.redirect(new URL('/sites', request.url));
      }
      siteId = pathSegments[pathIndex + 1];
      filePath = pathSegments.slice(pathIndex + 2).join('/') || 'index.html';
    }

    console.log(`[Multi-tenant API] Serving ${siteId}/${filePath} for ${hostname}`);

    const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.SERVICE_ROLE_KEY);
    const storagePath = `sites/${siteId}/${filePath}`;

    const { data, error } = await supabase.storage.from('documents').download(storagePath);

    if (error) {
      // SPA fallback: Try index.html for non-existent routes
      if (filePath !== 'index.html') {
        console.log(`[SPA Fallback] ${storagePath} not found, serving index.html`);
        const fallback = await supabase.storage.from('documents').download(`sites/${siteId}/index.html`);
        if (!fallback.error) {
          const indexBuffer = await fallback.data.arrayBuffer();
          
          // Track view for SPA fallback
          const externalSupabase = createExternalClient(
            SUPABASE_CONFIG.URL, 
            SUPABASE_CONFIG.SERVICE_ROLE_KEY
          );
          await trackSiteView(siteId, externalSupabase, request);
          
          return new NextResponse(Buffer.from(indexBuffer), {
            headers: { 
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=0, must-revalidate',
            },
          });
        }
      }
      return new NextResponse(`Site not found: ${siteId}`, { status: 404 });
    }

    const arrayBuffer = await data.arrayBuffer();
    const contentType = detectContentType(filePath);
    
    // Track view for HTML files (page loads)
    if (contentType.includes('html')) {
      // Create external Supabase client for tracking
      const externalSupabase = createExternalClient(
        SUPABASE_CONFIG.URL, 
        SUPABASE_CONFIG.SERVICE_ROLE_KEY
      );
      await trackSiteView(siteId, externalSupabase, request);
    }
    
    // Set appropriate cache headers
    // HTML: always revalidate so new deploys are picked up immediately
    // Hashed assets (Vite outputs like index-abc123.js): immutable long-cache is safe
    // Non-hashed assets: short cache so re-deploys are reflected quickly
    const isHashedAsset = /\.[a-f0-9]{8,}\./i.test(filePath)
    const cacheControl = contentType.includes('html')
      ? 'public, max-age=0, must-revalidate'
      : isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=60, must-revalidate';

    return new NextResponse(Buffer.from(arrayBuffer), {
      headers: { 
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      },
    });
  } catch (e) {
    console.error('[Multi-tenant API Error]', e);
    return new NextResponse(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`, { status: 500 });
  }
}