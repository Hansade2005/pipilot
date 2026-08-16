# pipilot-expo — E2B sandbox template for MOBILE (Expo / React Native) previews.
#
# A COMPLETE, LATEST-SDK Expo app pre-installed at /home/user, plus a self-starting
# dev server (expo-start.sh, wired as the E2B start command). On sandbox boot it runs
# `expo start --tunnel` — serving the WEB build on :8081 (exposed via the E2B public
# host → the in-app phone frame) AND the Expo Go tunnel — and writes the resolved
# exp:// URL to /tmp/expUrl. api/e2b.mjs then just maps the user's source in (Metro
# Fast Refresh swaps it) and reads the URLs.
#
# ALWAYS-LATEST: scaffolded with create-expo-app@latest at BUILD time, so each image
# tracks the newest stable Expo SDK. Rebuild monthly (schedule in the workflow) so
# store Expo Go connects with NO downgrade. Pin a known-good SDK with
# --build-arg EXPO_TEMPLATE=blank-typescript@<version> if a fresh SDK regresses.
FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=development \
    EXPO_NO_TELEMETRY=1

# node-gyp / native-module safety for arbitrary deps the agent may add at runtime,
# PLUS the Chromium runtime libraries Playwright needs (see the Playwright step below).
# The chromium libs are the same set as e2b-playwright.Dockerfile / e2b-video.Dockerfile;
# a font set is included so screenshots render with real typography instead of falling
# back to Times, which makes every captured screen look wrong.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git python3 make g++ wget \
      fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
      libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
      libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
      libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 \
      libxrender1 libxshmfence1 libxss1 libxtst6 xdg-utils libu2f-udev libvulkan1 \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest pnpm@9.15.0

WORKDIR /home/user

# 1) Scaffold the latest-SDK Expo app (blank TS = single App.tsx, coherent version
#    matrix picked by create-expo-app), then install.
#    Pin the pnpm store UNDER /home/user (project .npmrc) so it lives on the same fs as
#    node_modules AND at a path the RUNTIME user (uid ~1001, NOT the root build user) can
#    reach — otherwise runtime `pnpm add`/`expo install` fail with ERR_PNPM_UNEXPECTED_STORE
#    (store was at /root/... from the root build) and the agent can't add extra deps.
RUN npx --yes create-expo-app@latest . --template blank-typescript --no-install \
 && printf 'store-dir=/home/user/.pnpm-store\n' > /home/user/.npmrc \
 && pnpm install

# 2) Add the WEB (metro) + TUNNEL deps. `expo install` picks SDK-matched versions;
#    @expo/ngrok is a plain dep (not in the SDK matrix).
RUN npx --yes expo install react-dom react-native-web @expo/metro-runtime \
 && pnpm add @expo/ngrok@^4.1.0

# 3) Metro web bundler + a universal entry: native AppEntry imports root ./App, web
#    resolves ./index — so add index.js (registerRootComponent) and point main at it.
RUN node -e "const f='app.json',j=require('./'+f);j.expo=j.expo||{};j.expo.web=Object.assign({bundler:'metro'},j.expo.web);j.expo.name=j.expo.name||'PiPilot App';j.expo.slug=j.expo.slug||'pipilot-app';require('fs').writeFileSync(f,JSON.stringify(j,null,2))" \
 && printf "import { registerRootComponent } from 'expo'\nimport App from './App'\nregisterRootComponent(App)\n" > index.js \
 && node -e "const f='package.json',j=require('./'+f);j.main='index.js';require('fs').writeFileSync(f,JSON.stringify(j,null,2))"

# 4) Warm the Metro web cache so the FIRST real bundle is fast (best-effort; never
#    fail the build on it).
RUN (timeout 90 npx expo export --platform web --output-dir /tmp/warm > /tmp/warm.log 2>&1 || true) \
 && rm -rf /tmp/warm

# 5) Self-starting dev server (E2B start command → set via `--cmd` in the workflow).
COPY expo-start.sh /usr/local/bin/expo-start.sh
RUN chmod +x /usr/local/bin/expo-start.sh

# Record the baked SDK for observability.
RUN node -e "console.log('baked expo:', require('/home/user/node_modules/expo/package.json').version)" > /home/user/.expo-sdk-version 2>/dev/null || true

# 6) Playwright + Chromium, mirroring e2b-video.Dockerfile.
#
# WHY IT LIVES IN /opt AND NOT THE EXPO PROJECT: installing playwright into
# /home/user/node_modules would add it to the Expo app's dependency tree, where Metro
# would try to resolve it in bundles and the agent's `pnpm add` could hoist or dedupe it.
# A separate prefix keeps the preview app's tree exactly as create-expo-app produced it.
#
# WHY THE BROWSER PATH IS ABSOLUTE: E2B's SDK command execution does not reliably inherit
# the image's Docker ENV, so a browser installed to the default ~/.cache location can be
# invisible at runtime. Pinning PLAYWRIGHT_BROWSERS_PATH at install time AND exporting it
# means it resolves whether or not the env survives. Callers that spawn their own shell
# should still pass PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright explicitly.
#
# COST: this adds roughly 400MB to the image and some cold-start pull time on every mobile
# preview. That is the deliberate trade for having browser automation available in-place.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
WORKDIR /opt/pipilot-playwright
RUN npm init -y >/dev/null 2>&1 && npm install playwright \
 && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx playwright install chromium
WORKDIR /home/user

# Sandboxes run as a NON-ROOT user (uid ~1001) while this image is built as root, so the
# browser and the playwright package must be world-readable/executable or every launch
# fails with EACCES. /home/user gets its own chmod in the last layer; these live outside it.
RUN chmod -R a+rX /opt/ms-playwright /opt/pipilot-playwright

# Build-time assertion. Fails the image here rather than letting a broken browser surface
# at runtime, when it looks like an application bug. It really LAUNCHES chromium and renders
# a page: a binary that exists but cannot start (missing system lib) is the exact failure
# this guards against, and merely checking the file exists would miss it.
#
# Run as the UNPRIVILEGED `node` user, never root. Sandboxes execute as a non-root uid, and
# root can read the browser regardless of the chmod above — so a root-only check would pass
# on an image where every real launch dies with EACCES. HOME is pointed somewhere writable
# because chromium wants a home dir for its profile/crash paths.
RUN su node -s /bin/sh -c "HOME=/tmp PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright node -e \"const{chromium}=require('/opt/pipilot-playwright/node_modules/playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.setContent('<h1>ok</h1>');const t=await p.textContent('h1');await b.close();if(t!=='ok')throw new Error('chromium ran but returned '+t);console.log('[template] chromium launches and renders as non-root — ok')})().catch(e=>{console.error('[template] PLAYWRIGHT CHECK FAILED:',e.message);process.exit(1)})\""

# 7) The image is built as ROOT but sandboxes run as a non-root user (uid ~1001). Make the
#    whole project — node_modules, the pnpm store and caches — group/other writable so the
#    runtime user can `expo install`/`pnpm add` the user's extra libraries (Fast Refresh then
#    picks them up). Without this, runtime installs fail on permissions even with the store
#    fixed above. Last layer so it covers everything created earlier.
RUN chmod -R a+rwX /home/user
