# PiPilot Video E2B Template — programmatic video generation.
# Playwright/Chromium (motion-graphics title/credits cards + live-app screencast)
# + ffmpeg (b-roll trim, Ken Burns stills, xfade concat, music mux, encode)
# + a zero-API local stock corpus at /opt/stockdb (Jamendo moods + Unsplash
#   photos/topics/collections) + the storyboard-driven engine at /opt/pipilot-video.
# Alias: pipilot-video   Resources: 8 vCPU / 8192 MB (set at build time by the workflow).
#
# Mirrors e2b-playwright.Dockerfile (chromium deps) and adds ffmpeg + fonts + the
# render engine. TODO (with the voice feature): bake Piper TTS + a couple voices
# into /opt/piper for narration + captions — deferred so the first build stays green.

FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true
RUN echo 'keyboard-configuration keyboard-configuration/layout select English (US)' | debconf-set-selections
RUN echo 'keyboard-configuration keyboard-configuration/layoutcode select us' | debconf-set-selections

# System deps: Chromium runtime libs + ffmpeg (compositing/encode) + curl + a solid
# font set so the HTML cards render with real typography (not fallback Times).
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    ffmpeg \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# The render engine lives at /opt/pipilot-video. Its only npm dep is playwright
# (ffmpeg + curl are system binaries); chromium installs into node_modules so any
# user can launch it (PLAYWRIGHT_BROWSERS_PATH=0).
WORKDIR /opt/pipilot-video
RUN npm init -y && npm install playwright
RUN PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium
COPY e2b-video-template/generate.mjs e2b-video-template/stockdb.mjs e2b-video-template/storyboard.mjs ./

# The zero-API stock corpus (music moods + unsplash photos/topics/collections).
# stockdb.mjs defaults STOCKDB_DIR to /opt/stockdb.
COPY e2b-video-template/stockdb /opt/stockdb

# Let the runtime user read the engine/corpus and write render scratch
# (.cache/.work/out under the engine dir).
RUN chmod -R a+rwX /opt/pipilot-video /opt/stockdb

# E2B non-root runtime user.
RUN useradd -m -s /bin/bash user
RUN chmod -R a+rwX /home/user && chown -R user:user /home/user

USER user
WORKDIR /home/user

ENV NODE_ENV=development
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV STOCKDB_DIR=/opt/stockdb

CMD ["/bin/bash"]
