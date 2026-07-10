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
# (ffmpeg + curl are system binaries). Install Chromium to a FIXED absolute path
# (/opt/ms-playwright) rather than node_modules or ~/.cache: E2B's SDK command
# execution doesn't reliably inherit the image's Docker ENV, so the browser must
# live at a path the engine can pin itself (generate.mjs sets the same default).
WORKDIR /opt/pipilot-video
RUN npm init -y && npm install playwright
RUN PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx playwright install --with-deps chromium
COPY e2b-video-template/generate.mjs e2b-video-template/stockdb.mjs e2b-video-template/storyboard.mjs e2b-video-template/logo.svg ./

# The zero-API stock corpus (music moods + unsplash photos/topics/collections).
# stockdb.mjs defaults STOCKDB_DIR to /opt/stockdb.
COPY e2b-video-template/stockdb /opt/stockdb

# ── Piper TTS (narration voices) ─────────────────────────────────────────────
# The Piper binary (self-contained: bundles espeak-ng-data + libs) → /opt/piper.
RUN mkdir -p /opt/piper && cd /opt/piper \
    && curl -fsSL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz -o piper.tgz \
    && tar xzf piper.tgz --strip-components=1 && rm piper.tgz && chmod +x piper
# ~20 curated voices from rhasspy/piper-voices (HF). Tolerant: a voice that 404s
# is skipped (the engine falls back to a default), so a bad URL never fails the build.
# Saved as /opt/piper/voices/<friendly>.onnx (+ .onnx.json).
RUN mkdir -p /opt/piper/voices && cd /opt/piper/voices \
    && base="https://huggingface.co/rhasspy/piper-voices/resolve/main" \
    && while IFS=: read -r name p; do \
         [ -z "$name" ] && continue; \
         ( curl -fsSL "$base/$p.onnx" -o "$name.onnx" && curl -fsSL "$base/$p.onnx.json" -o "$name.onnx.json" ) || { echo "skip voice $name"; rm -f "$name.onnx" "$name.onnx.json"; }; \
       done <<'VOICES'
amy:en/en_US/amy/medium/en_US-amy-medium
lessac:en/en_US/lessac/medium/en_US-lessac-medium
ryan:en/en_US/ryan/high/en_US-ryan-high
joe:en/en_US/joe/medium/en_US-joe-medium
kusal:en/en_US/kusal/medium/en_US-kusal-medium
kristin:en/en_US/kristin/medium/en_US-kristin-medium
hfc_female:en/en_US/hfc_female/medium/en_US-hfc_female-medium
hfc_male:en/en_US/hfc_male/medium/en_US-hfc_male-medium
john:en/en_US/john/medium/en_US-john-medium
norman:en/en_US/norman/medium/en_US-norman-medium
bryce:en/en_US/bryce/medium/en_US-bryce-medium
danny:en/en_US/danny/low/en_US-danny-low
kathleen:en/en_US/kathleen/low/en_US-kathleen-low
alan:en/en_GB/alan/medium/en_GB-alan-medium
alba:en/en_GB/alba/medium/en_GB-alba-medium
cori:en/en_GB/cori/high/en_GB-cori-high
jenny:en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium
northern:en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium
siwis_fr:fr/fr_FR/siwis/medium/fr_FR-siwis-medium
thorsten_de:de/de_DE/thorsten/medium/de_DE-thorsten-medium
davefx_es:es/es_ES/davefx/medium/es_ES-davefx-medium
VOICES

# ── Wav2Lip (talking-avatar lip-sync, CPU) ───────────────────────────────────
# Original Rudrabha/Wav2Lip on torch-CPU — every dependency is a prebuilt manylinux
# wheel (ZERO source compilation), and the S3FD detector + checkpoints come from the
# camenduru HuggingFace MIRROR (no Google Drive → no 404 risk in a headless build).
# The engine feeds it an a0-generated presenter portrait + the scene's Piper narration
# wav → a lip-synced talking head for {kind:"avatar"} scenes. librosa is pinned to
# 0.9.2 because 0.10+ makes librosa.filters.mel's args keyword-only and hard-breaks
# Wav2Lip's audio.py; numba/llvmlite/numpy are the co-installable wheel set.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip git \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/Rudrabha/Wav2Lip.git /opt/wav2lip
WORKDIR /opt/wav2lip
RUN pip3 install --no-cache-dir --break-system-packages \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      torch==2.0.1 torchvision==0.15.2 \
      numpy==1.23.5 opencv-python-headless==4.9.0.80 \
      librosa==0.9.2 numba==0.58.1 llvmlite==0.41.1 scipy==1.11.4 tqdm
RUN mkdir -p checkpoints face_detection/detection/sfd temp \
    && curl -fSL https://huggingface.co/camenduru/Wav2Lip/resolve/main/checkpoints/wav2lip_gan.pth -o checkpoints/wav2lip_gan.pth \
    && curl -fSL https://huggingface.co/camenduru/Wav2Lip/resolve/main/face_detection/detection/sfd/s3fd.pth -o face_detection/detection/sfd/s3fd.pth
WORKDIR /opt/pipilot-video

# Let the runtime user read the engine/corpus and write render scratch
# (.cache/.work/out under the engine dir). Wav2Lip writes temp/ under /opt/wav2lip.
RUN chmod -R a+rwX /opt/pipilot-video /opt/stockdb /opt/ms-playwright /opt/piper /opt/wav2lip

# E2B non-root runtime user.
RUN useradd -m -s /bin/bash user
RUN chmod -R a+rwX /home/user && chown -R user:user /home/user

USER user
WORKDIR /home/user

ENV NODE_ENV=development
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
ENV STOCKDB_DIR=/opt/stockdb
ENV LD_LIBRARY_PATH=/opt/piper
ENV PIPER_DIR=/opt/piper

CMD ["/bin/bash"]
