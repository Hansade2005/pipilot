import type { Metadata } from 'next'
// import { Poppins } from 'next/font/google'
import './globals.css'
import { Toaster } from "@/components/ui/toaster"
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { ThemeProvider } from "@/components/theme-provider"
import { ServiceWorkerProvider } from "@/components/service-worker-provider"
import { OneSignalProvider } from "@/components/onesignal-provider"

// const poppins = Poppins({
//   subsets: ['latin'],
//   weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
//   variable: '--font-poppins',
//   display: 'swap',
// })

export const metadata: Metadata = {
  title: 'PiPilot - Canada\'s First Agentic Vibe Coding Platform | AI App Builder',
  description: 'Discover PiPilot, Canada\'s pioneering Agentic Vibe Coding Platform. Build apps faster with AI - the ultimate alternative to Lovable.dev, Bolt.new, v0, and Replit. Chat to code, deploy instantly.',
  keywords: ['PiPilot', 'AI coding platform Canada', 'agentic vibe coding', 'AI app builder 2025', 'vibe coding tools', 'chat to code', 'Canadian AI development', 'first agentic coding platform', 'Lovable alternative', 'Bolt.new competitor', 'v0 replacement', 'Replit better', 'AI-powered app development', 'no-code AI builder', 'Canadian tech innovation'],
  authors: [{ name: 'PiPilot Team' }],
  creator: 'PiPilot',
  publisher: 'Anye Happiness Ade',
  applicationName: 'PiPilot',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://pipilot.dev'),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PiPilot',
  },
  openGraph: {
    title: 'PiPilot - Canada\'s First Agentic Vibe Coding Platform',
    description: 'Build apps 10x faster with Canada\'s leading AI coding platform. Agentic Vibe Coding - the future of development. Superior to Lovable, Bolt, v0, and Replit.',
    url: 'https://pipilot.dev',
    siteName: 'PiPilot',
    type: 'website',
    locale: 'en_CA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PiPilot - Canada\'s #1 Agentic Vibe Coding Platform',
    description: 'Experience the power of agentic AI coding. Canada\'s first and best alternative to global platforms like Lovable.dev, Bolt.new, v0, and Replit.',
    creator: '@anyehappinessade',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://pipilot.dev',
  },
  category: 'Technology',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.svg',
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PiPilot" />
        <meta name="theme-color" content="#6366f1" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png" />
        {/* Google Fonts - Marmelad, Josefin Slab & Special Elite */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Josefin+Slab:ital,wght@0,100..700;1,100..700&family=Marmelad&family=Special+Elite&display=swap" rel="stylesheet" />
        {/* OneSignal SDK */}
        <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.OneSignalDeferred = window.OneSignalDeferred || [];
              OneSignalDeferred.push(async function(OneSignal) {
                await OneSignal.init({
                  appId: "${process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '074baec0-7042-4faf-a337-674711dd90ad'}",
                });
              });
            `,
          }}
        />
        {/* Tawk.to Live Chat - Dynamically hidden on specific pages */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              var Tawk_API = Tawk_API || {};
              var Tawk_LoadStart = new Date();

              // Function to check if widget should be hidden
              function shouldHideTawkWidget() {
                var isWorkspaceWithProject = window.location.pathname === '/workspace' && window.location.search.includes('projectId');
                var isSupportPage = window.location.pathname === '/support';
                var isDocsPage = window.location.pathname === '/docs';
                var isAgentCloudPage = window.location.pathname.startsWith('/agent-cloud');
                return isWorkspaceWithProject || isSupportPage || isDocsPage || isAgentCloudPage;
              }

              // Function to update widget visibility
              function updateTawkVisibility() {
                if (typeof Tawk_API.hideWidget === 'function' && typeof Tawk_API.showWidget === 'function') {
                  if (shouldHideTawkWidget()) {
                    Tawk_API.hideWidget();
                  } else {
                    Tawk_API.showWidget();
                  }
                }
              }

              // Set initial visibility on load
              Tawk_API.onLoad = function() {
                updateTawkVisibility();
              };

              // Listen for route changes (Next.js client-side navigation)
              (function() {
                var originalPushState = history.pushState;
                var originalReplaceState = history.replaceState;

                history.pushState = function() {
                  originalPushState.apply(this, arguments);
                  setTimeout(updateTawkVisibility, 100);
                };

                history.replaceState = function() {
                  originalReplaceState.apply(this, arguments);
                  setTimeout(updateTawkVisibility, 100);
                };

                window.addEventListener('popstate', function() {
                  setTimeout(updateTawkVisibility, 100);
                });
              })();

              // Load Tawk.to script after page is fully ready to avoid i18next race condition
              function loadTawkTo() {
                var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
                s1.async=true;
                s1.src='https://embed.tawk.to/696f56620938061981966d61/1jfdeist0';
                s1.charset='UTF-8';
                s1.setAttribute('crossorigin','*');
                s0.parentNode.insertBefore(s1,s0);
              }

              // Delay loading to ensure page is fully ready
              if (document.readyState === 'complete') {
                setTimeout(loadTawkTo, 100);
              } else {
                window.addEventListener('load', function() {
                  setTimeout(loadTawkTo, 100);
                });
              }
            `,
          }}
        />
      </head>
      <body className="dark:bg-gray-900 dark:text-white font-sans">
        <ServiceWorkerProvider />
        <OneSignalProvider />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
