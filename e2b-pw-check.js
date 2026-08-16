// Build-time Playwright assertion for the E2B templates. Lives in its own file, NOT inline
// in a Dockerfile `RUN node -e "..."`: E2B's v2 builder strips backslash escapes out of RUN
// commands, so the \" that used to quote this payload arrived as a bare " and closed the
// outer quote early, failing the build with a shell parse error.
//
// It really LAUNCHES chromium and renders a page — a binary that exists but cannot start
// (missing system lib) is the exact failure this guards against, and checking the file
// exists would miss it. Run as the unprivileged `node` user, since sandboxes execute as a
// non-root uid and root can read the browser regardless of the image's chmod.
const { chromium } = require('/opt/pipilot-playwright/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent('<h1>ok</h1>')
  const text = await page.textContent('h1')
  await browser.close()
  if (text !== 'ok') throw new Error('chromium ran but returned ' + text)
  console.log('[template] chromium launches and renders as non-root — ok')
})().catch((e) => {
  console.error('[template] PLAYWRIGHT CHECK FAILED:', e.message)
  process.exit(1)
})
