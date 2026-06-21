# PiPilot Desktop E2B Template — Live native preview runtime.
#
# Extends E2B's official desktop template (Ubuntu 22.04 + XFCE + Xvfb + x11vnc +
# noVNC on port 6080) and additionally prebakes Node.js 22 + Electron's headless
# runtime shared libraries, so an Electron app launches on the virtual display
# with NO per-preview apt/npm install.
#
# Streaming model: the XFCE desktop renders on Xvfb (:0); x11vnc exposes it on
# :5900; noVNC's websockify bridges that to an HTTP/WebSocket server on :6080.
# PiPilot's "Live native preview" embeds the noVNC URL and runs the user's
# Electron app inside the sandbox via `npx electron . --no-sandbox`, which paints
# directly onto the same Xvfb display — visible in the streamed window.
#
# Template name: pipilot-desktop
# Deploy via: .github/workflows/deploy-desktop-template.yml
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# E2B desktop base: unminimize + full XFCE desktop, Xvfb, x11vnc, utilities.
RUN yes | unminimize \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      xserver-xorg xorg x11-xserver-utils xvfb x11-utils xauth \
      xfce4 xfce4-goodies util-linux sudo curl git wget python3-pip \
      xdotool scrot ffmpeg x11vnc net-tools netcat \
      x11-apps libreoffice xpdf gedit xpaint tint2 galculator pcmanfm \
 && rm -rf /var/lib/apt/lists/*

# noVNC (E2B fork) + websockify for the browser-facing VNC bridge on :6080.
RUN git clone --branch e2b-desktop https://github.com/e2b-dev/noVNC.git /opt/noVNC \
 && ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html \
 && git clone --branch v0.12.0 https://github.com/novnc/websockify /opt/noVNC/utils/websockify

# Default terminal emulator (XFCE).
RUN ln -sf /usr/bin/xfce4-terminal.wrapper /etc/alternatives/x-terminal-emulator

# --- PiPilot additions -------------------------------------------------------
# Node.js 22 so the agent can `npx electron .` with no per-preview toolchain
# install.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# Electron's headless runtime shared libraries — the GTK/NSS/X stack Chromium
# (Electron) dynamically links against, so `npx electron . --no-sandbox` renders
# on Xvfb without prompting for any missing .so at launch time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils \
      libatspi2.0-0 libdrm2 libgbm1 libasound2 libxshmfence1 libcups2 \
 && rm -rf /var/lib/apt/lists/*
# -----------------------------------------------------------------------------

# Start command that brings up Xvfb -> XFCE -> x11vnc -> noVNC.
COPY start_command.sh /start_command.sh
RUN sed -i 's/$//' /start_command.sh && chmod +x /start_command.sh
