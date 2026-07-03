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

# node-gyp / native-module safety for arbitrary deps the agent may add at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest pnpm@9.15.0

WORKDIR /home/user

# 1) Scaffold the latest-SDK Expo app (blank TS = single App.tsx, coherent version
#    matrix picked by create-expo-app), then install.
RUN npx --yes create-expo-app@latest . --template blank-typescript --no-install \
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
