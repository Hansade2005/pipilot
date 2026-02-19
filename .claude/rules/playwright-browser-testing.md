# Playwright Browser Testing Setup

When you need to view, test, or screenshot any web page (local dev server or external), use the project's Playwright browse helper instead of trying to open a browser directly.

## Quick Usage

Take a screenshot of a local page:
```bash
BROWSE_URL="http://localhost:3000" SCREENSHOT_PATH="screenshots/page.png" npx playwright test e2e/browse.spec.ts
```

Then read the screenshot file with the Read tool to view it visually.

## Available Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSE_URL` | `https://example.com` | URL to visit |
| `SCREENSHOT_PATH` | `screenshots/page.png` | Where to save the screenshot |
| `CLICK_SELECTOR` | - | CSS selector to click before screenshot |
| `TYPE_SELECTOR` | - | CSS selector to type into |
| `TYPE_TEXT` | - | Text to type (used with TYPE_SELECTOR) |
| `WAIT_FOR` | - | CSS selector to wait for before screenshot |
| `FULL_PAGE` | `true` | Set to `"false"` for viewport-only screenshot |
| `EXTRACT_TEXT` | - | CSS selector to extract text content from |
| `EXTRACT_HTML` | `"true"` | Extract full page HTML |
| `EXTRACT_LINKS` | `"true"` | Extract all links on the page |
| `MOBILE` | - | Set to `"true"` for mobile viewport (375x812) |
| `WAIT_UNTIL` | `networkidle` | Page load strategy: `load`, `domcontentloaded`, or `networkidle` |

## Examples

### Screenshot the homepage (full page)
```bash
BROWSE_URL="http://localhost:3000" SCREENSHOT_PATH="screenshots/homepage.png" npx playwright test e2e/browse.spec.ts
```

### Screenshot a specific route (viewport only)
```bash
BROWSE_URL="http://localhost:3000/support" SCREENSHOT_PATH="screenshots/support.png" FULL_PAGE="false" npx playwright test e2e/browse.spec.ts
```

### Mobile screenshot
```bash
BROWSE_URL="http://localhost:3000" SCREENSHOT_PATH="screenshots/mobile.png" MOBILE="true" npx playwright test e2e/browse.spec.ts
```

### Click something then screenshot
```bash
BROWSE_URL="http://localhost:3000" CLICK_SELECTOR="button.menu" SCREENSHOT_PATH="screenshots/after-click.png" npx playwright test e2e/browse.spec.ts
```

### Extract text from an element
```bash
BROWSE_URL="http://localhost:3000" EXTRACT_TEXT="h1" npx playwright test e2e/browse.spec.ts
```

## Configuration

- **Config file:** `playwright.config.ts`
- **Test file:** `e2e/browse.spec.ts`
- **Browser:** Headless Chromium (path: `/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome`)
- **Default viewport:** 1280x720
- **Sandbox:** Disabled (for CI/container environments)

## Proxy Bypass (Critical for this environment)

The container has an egress proxy configured (`HTTPS_PROXY`, `HTTP_PROXY`). The Playwright config at `playwright.config.ts` explicitly passes this proxy to the browser, which breaks localhost access (dns_nxdomain error).

**For localhost URLs**, always unset proxy vars:
```bash
HTTPS_PROXY="" HTTP_PROXY="" https_proxy="" http_proxy="" BROWSE_URL="http://localhost:3000" SCREENSHOT_PATH="screenshots/page.png" npx playwright test e2e/browse.spec.ts
```

**For external URLs** (e.g., `https://pipilot.dev`), keep the proxy (run normally without unsetting).

## Live Site vs Localhost

- **Prefer testing on the live site** (`https://pipilot.dev`) when available - no env var setup needed and avoids Supabase middleware crashes
- Localhost requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to avoid middleware runtime errors
- Ask the user for the live URL if you need to visually check the app

## Important Notes

1. Always ensure the dev server is running (`npm run dev`) before screenshotting localhost
2. Screenshots are saved as PNG files - use the Read tool to view them
3. The `networkidle` wait strategy is used by default, which waits for no network activity for 500ms
4. For pages with animations/loading, use `WAIT_FOR` to wait for a specific element before capturing
5. Use `WAIT_UNTIL="domcontentloaded"` for faster screenshots when networkidle takes too long
