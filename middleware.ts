import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

// Admin email for role-based access — loaded from environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''

// Reserved subdomains that should NOT be treated as site subdomains
const RESERVED_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'auth', 'dashboard']

// Extract subdomain from hostname for multi-tenant routing
function getSubdomain(hostname: string): string | null {
  // Remove port if present
  const host = hostname.split(':')[0];

  // For local development, treat localhost as no subdomain
  if (host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  // Only apply subdomain routing for pipilot.dev domains
  if (!host.endsWith('pipilot.dev')) {
    return null;
  }

  // Split by dots and check if we have a subdomain
  const parts = host.split('.');

  // If we have more than 2 parts, we have a subdomain
  // e.g., myproject.pipilot.dev -> ['myproject', 'pipilot', 'dev']
  if (parts.length > 2) {
    const subdomain = parts[0];
    
    // Skip reserved subdomains (main app routes)
    if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      return null;
    }
    
    return subdomain; // Return the first part as subdomain
  }

  return null; // No subdomain
}

export async function middleware(request: NextRequest) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://pipilot.dev',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  // Handle multi-tenant subdomain routing
  const hostname = request.headers.get('host') || '';
  const subdomain = getSubdomain(hostname);

  // If we have a subdomain, rewrite to the sites route
  if (subdomain) {
    const url = request.nextUrl.clone();

    // For root requests to subdomains, explicitly serve index.html
    const originalPath = request.nextUrl.pathname;
    const targetPath = originalPath === '/' ? `/sites/${subdomain}/index.html` : `/sites/${subdomain}${originalPath}`;

    url.pathname = targetPath;

    console.log(`[Multi-tenant] Rewriting ${hostname}${originalPath} → ${targetPath}`);

    const rewriteResponse = NextResponse.rewrite(url);
    rewriteResponse.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://pipilot.dev')
    rewriteResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    rewriteResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    return rewriteResponse;
  }

  // Skip Supabase auth for public API routes
  if (request.nextUrl.pathname.startsWith('/api/v1')) {
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://pipilot.dev');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  // Create a response object to mutate
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create a Supabase client configured to use cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  const { data: { user } } = await supabase.auth.getUser()

  // Protect admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      // Redirect to login if not authenticated
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    if (user.email !== ADMIN_EMAIL) {
      // Redirect to workspace if not admin
      return NextResponse.redirect(new URL('/workspace', request.url))
    }
  }

  // Protect workspace routes (require authentication)
  if (request.nextUrl.pathname.startsWith('/workspace')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Protect database routes (require authentication)
  if (request.nextUrl.pathname.startsWith('/database')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Add CORS headers to all responses
  response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://pipilot.dev')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
