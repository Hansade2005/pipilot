# pipilot-expo — E2B sandbox template for MOBILE (Expo / React Native) previews and Crew builds.
#
# The app and its dependencies live in ONE directory: /home/user/workspace. That is also the
# directory Crew missions run in (api/e2b.mjs mission dir) and the directory the preview maps
# the user's source into (expoMapFiles). Everything builds where node_modules already is.
#
# WHY npm, AND WHY ONE DIRECTORY — this is the whole point of this file:
# The image used to install with pnpm at /home/user while the project lived at
# /home/user/workspace. pnpm's node_modules is a tree of SYMLINKS into a .pnpm store, and Metro
# (Expo's bundler) does not follow that indirection for transitive dependencies — so a build from
# the workspace could not resolve them. Agents then "fixed" it by copying the tree across
# (`cp -rL`), which dereferences symlinks but yields a FLAT, PARTIAL copy missing every transitive
# dep, and a real production run burned ~30 commands chasing "Unable to resolve module" one
# package at a time (expo-router entry.js, @react-navigation/core, @babel/runtime, fbjs, nanoid,
# scheduler, …) and never finished. npm's flat, real-directory node_modules in the build
# directory makes that entire failure class impossible. Do not reintroduce pnpm here.
#
# PINNED, NOT ALWAYS-LATEST: the app is scaffolded from e2b-expo-template/, which mirrors the
# builder's own Expo scaffold (builder-src/src/builder/frameworks.ts, const EXPO) — same SDK,
# same pins, same expo-router major, same entry. The previous image used create-expo-app@latest,
# so it drifted to whatever SDK was newest (SDK 57) while the user's package.json said SDK 54;
# expo-router then resolved across a major and Metro failed on a changed entry point.
# KEEP e2b-expo-template/ IN SYNC WITH frameworks.ts EXPO — that agreement is what makes the
# prebaked node_modules correct for the app that gets written into it.
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

# npm is PINNED, not @latest — current npm prints run-notices into stdout that Expo/Metro
# tooling has parsed as JSON before now. 10.9.2 predates them.
#
# pnpm is NOT installed. Neither is @nubjs/nub: an agent found `nub` on PATH and started calling
# it directly despite being told not to, and `nub install` corrupted the prebaked tree exactly
# like the old npx shim did. Leaving a package manager off PATH is a stronger guardrail than a
# prompt instruction not to use it, and that reasoning is now why pnpm is gone too.
RUN npm install -g npm@10.9.2

# 1) The project — scaffold + install, both in /home/user/workspace.
#    `npm install` (not ci): e2b-expo-template/ deliberately has no lockfile, so the SDK-pinned
#    ranges resolve to current patches at build time without a lockfile to maintain.
WORKDIR /home/user/workspace
COPY e2b-expo-template/ /home/user/workspace/
RUN npm install --no-audit --no-fund

# 2) Warm the Metro web cache so the FIRST real bundle is fast (best-effort; never fail on it).
RUN (timeout 120 npx expo export --platform web --output-dir /tmp/warm > /tmp/warm.log 2>&1 || true) \
 && rm -rf /tmp/warm

# 3) Self-starting dev server (E2B start command → set via `--cmd` in the workflow).
COPY expo-start.sh /usr/local/bin/expo-start.sh
RUN chmod +x /usr/local/bin/expo-start.sh

# Record the baked SDK for observability.
RUN node -e "console.log('baked expo:', require('/home/user/workspace/node_modules/expo/package.json').version)" > /home/user/.expo-sdk-version 2>/dev/null || true

# 4) Playwright + Chromium, mirroring e2b-video.Dockerfile.
#
# WHY IT LIVES IN /opt AND NOT THE EXPO PROJECT: installing playwright into the workspace's
# node_modules would add it to the Expo app's dependency tree, where Metro would try to resolve
# it in bundles and a runtime `npm install` could hoist or dedupe it. A separate prefix keeps the
# preview app's tree exactly as the scaffold's package.json describes it.
#
# WHY THE BROWSER PATH IS ABSOLUTE: E2B's SDK command execution does not reliably inherit the
# image's Docker ENV, so a browser installed to the default ~/.cache location can be invisible at
# runtime. Pinning PLAYWRIGHT_BROWSERS_PATH at install time AND exporting it means it resolves
# whether or not the env survives. Callers that spawn their own shell should still pass
# PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright explicitly.
#
# COST: roughly 400MB and some cold-start pull time on every mobile preview. That is the
# deliberate trade for having browser automation available in-place.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
WORKDIR /opt/pipilot-playwright
RUN npm init -y >/dev/null 2>&1 && npm install playwright \
 && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx playwright install chromium

# Sandboxes run as a NON-ROOT user (uid ~1001) while this image is built as root, so the
# browser and the playwright package must be world-readable/executable or every launch
# fails with EACCES. /home/user gets its own chmod in a later layer; these live outside it.
RUN chmod -R a+rX /opt/ms-playwright /opt/pipilot-playwright

# 5) Mission Runner / Crew stream server deps (express, the Claude Agent SDK, zod), baked so
# api/e2b.mjs's mission_stream setup finds them already installed instead of installing on every
# cold start — this is Crew's template (crew.ts spawns it with template:'pipilot-expo'), so this
# is the box that actually pays that cost on every dispatch today. A separate /opt prefix for the
# same reason Playwright gets one above. api/e2b.mjs still PROBES `tool`/`createSdkMcpServer` at
# runtime and reinstalls if a baked version goes stale, so this is a cold-start speed win, not a
# hard pin.
WORKDIR /opt/pipilot-stream
RUN echo '{"type":"module"}' > package.json \
 && npm install express @anthropic-ai/claude-agent-sdk zod \
 && chmod -R a+rX /opt/pipilot-stream

# Build-time assertion: fail the image here if the baked SDK doesn't export the custom-tool API
# the stream server needs, rather than finding out at a live mission's first dispatch.
RUN cd /opt/pipilot-stream && node -e "import('@anthropic-ai/claude-agent-sdk').then(m=>{if(!m.tool||!m.createSdkMcpServer){console.error('[template] baked claude-agent-sdk is missing tool/createSdkMcpServer exports');process.exit(1)}console.log('[template] baked claude-agent-sdk exports tool+createSdkMcpServer - ok')})"

# Build-time assertion, same spirit. Fails the image here rather than letting a broken browser
# surface at runtime, when it looks like an application bug. It really LAUNCHES chromium and
# renders a page: a binary that exists but cannot start (missing system lib) is the exact failure
# this guards against, and merely checking the file exists would miss it.
#
# Run as the UNPRIVILEGED `node` user, never root. Sandboxes execute as a non-root uid, and root
# can read the browser regardless of the chmod above — so a root-only check would pass on an
# image where every real launch dies with EACCES. HOME is pointed somewhere writable because
# chromium wants a home dir for its profile/crash paths.
COPY e2b-pw-check.js /usr/local/bin/pw-check.js
RUN su node -s /bin/sh -c "HOME=/tmp PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright node /usr/local/bin/pw-check.js"

WORKDIR /home/user/workspace

# 6) THE REAL SMOKE TEST — the exact command Crew and the preview run first, against the exact
# tree they will run it against. This is what proves the point of this image: a plain
# `npx expo export` from the project directory resolves every transitive dependency with no
# linking, copying, or store reconciliation. A shallow `npx expo --version` check is what let the
# previous resolution regression ship.
#
# CI=1 forces every Expo/Metro CLI prompt (telemetry consent, update checks) into its
# non-interactive default instead of waiting on a TTY that a Docker RUN does not have — omitting
# it once hung a build past 17 minutes on a prompt with closed stdin. `timeout 240` is the hard
# backstop regardless.
RUN cd /home/user/workspace && CI=1 timeout 240 npx expo export --platform web --output-dir /tmp/build-check 2>&1 | tail -40 \
 && test -f /tmp/build-check/index.html \
 && rm -rf /tmp/build-check .expo dist \
 && echo "[template] npx expo export resolves + builds the scaffold from its own directory — ok"

# 7) The image is built as ROOT but sandboxes run as a non-root user (uid ~1001). Make the whole
#    project — node_modules, the Metro cache, everything the export above created — group/other
#    writable so the runtime user can `npx expo install` / `npm install` the user's extra
#    libraries and Metro can write its cache. LAST layer so it covers everything created earlier.
RUN chmod -R a+rwX /home/user
