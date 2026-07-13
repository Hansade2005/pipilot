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
COPY e2b-video-template/generate.mjs e2b-video-template/stockdb.mjs e2b-video-template/storyboard.mjs e2b-video-template/cards.mjs e2b-video-template/logo.svg ./

# The zero-API stock corpus (music moods + unsplash photos/topics/collections).
# stockdb.mjs defaults STOCKDB_DIR to /opt/stockdb.
COPY e2b-video-template/stockdb /opt/stockdb

# ── Kokoro-ONNX TTS (narration) ──────────────────────────────────────────────
# Kokoro replaces Piper (whose espeak-ng data caused garbled/inconsistent narration).
# Installed in its OWN venv so its numpy/onnxruntime never conflict with Wav2Lip's
# pinned numpy (same isolation pattern as /opt/matte-venv). Model + voices → /opt/kokoro.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
    && python3 -m venv /opt/kokoro-venv \
    && /opt/kokoro-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/kokoro-venv/bin/pip install --no-cache-dir kokoro-onnx soundfile \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/kokoro \
    && curl -fsSL "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx" -o /opt/kokoro/kokoro-v1.0.onnx \
    && curl -fsSL "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin" -o /opt/kokoro/voices-v1.0.bin

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

# ── Background matting for transparent presenters (U^2-Net via onnxruntime) ───
# Cuts the person out of the (opaque) Wav2Lip talking-head so it composites over the
# scene background with NO white box. Because Wav2Lip moves only the mouth, one mask
# (from a single frame) matts the whole clip. CRITICAL: onnxruntime pulls numpy 2.x,
# which is ABI-incompatible with Wav2Lip's cv2/torch (built against numpy 1.23.5) —
# installing it globally breaks Wav2Lip (numpy.core.multiarray import fails). So the
# matting stack lives in its OWN venv (matte.py runs under /opt/matte-venv/bin/python)
# and never touches the global numpy that Wav2Lip depends on.
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/matte-venv \
    && /opt/matte-venv/bin/pip install --no-cache-dir onnxruntime pillow numpy
RUN mkdir -p /opt/u2net && curl -fSL https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx -o /opt/u2net/u2net.onnx
COPY e2b-video-template/matte.py ./

# YouTube ingest stack — yt-dlp (download/clip) + youtube-transcript-api (timestamped transcript),
# in their OWN venv so they never touch the kokoro/matte numpy. ffmpeg (already baked) does the
# precise -c copy cuts. Powers the agent's youtube_transcript / youtube_clip repurposing tools.
RUN python3 -m venv /opt/yt-venv \
    && /opt/yt-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/yt-venv/bin/pip install --no-cache-dir yt-dlp youtube-transcript-api

# Baked presenter CHARACTER library — a small curated set of frontal a0 portraits the
# agent can pick by name (presenter:{character:"aria"}). Delivered as .webp; convert to
# real JPEG at build time (cv2.imread in Wav2Lip is happiest with JPEG). Matting still
# runs on these at render, so they composite transparently just like a generated face.
COPY e2b-video-template/avatars /opt/avatars
RUN for f in /opt/avatars/*.webp; do [ -e "$f" ] && ffmpeg -y -loglevel error -i "$f" "${f%.webp}.jpg" && rm -f "$f"; done; ls -la /opt/avatars

# Let the runtime user read the engine/corpus and write render scratch
# (.cache/.work/out under the engine dir). Wav2Lip writes temp/ under /opt/wav2lip.
RUN chmod -R a+rwX /opt/pipilot-video /opt/stockdb /opt/ms-playwright /opt/kokoro /opt/kokoro-venv /opt/wav2lip /opt/u2net /opt/avatars /opt/matte-venv /opt/yt-venv

# E2B non-root runtime user.
RUN useradd -m -s /bin/bash user
RUN chmod -R a+rwX /home/user && chown -R user:user /home/user

USER user
WORKDIR /home/user

ENV NODE_ENV=development
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
ENV STOCKDB_DIR=/opt/stockdb
ENV KOKORO_PY=/opt/kokoro-venv/bin/python
ENV KOKORO_MODEL=/opt/kokoro/kokoro-v1.0.onnx
ENV YT_DLP=/opt/yt-venv/bin/yt-dlp
ENV YT_PY=/opt/yt-venv/bin/python
ENV KOKORO_VOICES=/opt/kokoro/voices-v1.0.bin
ENV KOKORO_VOICE=am_fenrir

CMD ["/bin/bash"]
