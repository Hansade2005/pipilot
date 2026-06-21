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
      xdotool scrot ffmpeg x11vnc dbus-x11 net-tools netcat \
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

# --- Tauri Linux build deps --------------------------------------------------
# Tauri v2 renders its window through webkit2gtk (not Chromium) and links the
# GTK/GLib/libsoup/appindicator stack at compile + run time. patchelf + file are
# used by the bundler; build-essential/pkg-config/libssl are needed to compile
# the Rust crates (`tao`/`wry`/`tauri`). Installed as root so `tauri dev`/`cargo
# build` succeed with no per-preview apt install.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev patchelf \
      libayatana-appindicator3-dev build-essential libssl-dev \
      libsoup-3.0-dev pkg-config file \
 && rm -rf /var/lib/apt/lists/*
# -----------------------------------------------------------------------------

# Start command that brings up Xvfb -> XFCE -> x11vnc -> noVNC.
COPY start_command.sh /start_command.sh
RUN sed -i 's/$//' /start_command.sh && chmod +x /start_command.sh

# --- Warm Electron deps: first preview's `npm install` is near-instant ---------
# E2B runs the sandbox as `user`. Create it, then prefetch the Electron binary +
# vite/react/electron-builder into /home/user/app/node_modules. Keep this
# package.json in sync with the ELECTRON scaffold in
# builder-src/src/builder/frameworks.ts (deps + devDependencies).
RUN useradd -m -s /bin/bash user \
 && mkdir -p /home/user/app /home/user/.npm /home/user/.cache \
 && chown -R user:user /home/user
USER user
WORKDIR /home/user/app
COPY --chown=user:user pipilot-desktop-template/package.json /home/user/app/package.json
RUN npm install --no-audit --no-fund

# --- Rust toolchain SYSTEM-WIDE (Tauri backend) ------------------------------
# CRITICAL: E2B REPROVISIONS the user's home at sandbox start, so a build-time
# ~/.cargo is GONE at runtime (cargo --version passes in the build but vanishes
# in the running box → "cargo metadata ... No such file"). Install Rust into
# /usr/local (a SYSTEM dir that persists), world-writable so the runtime `user`
# can run cargo + write its caches, with /usr/local/cargo/bin on PATH via
# /etc/profile.d (sourced by the `bash -lc` launch).
USER root
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --no-modify-path --default-toolchain stable --profile minimal \
 && printf '%s\n' 'export RUSTUP_HOME=/usr/local/rustup' 'export CARGO_HOME=/usr/local/cargo' 'export PATH=/usr/local/cargo/bin:$PATH' > /etc/profile.d/cargo.sh \
 && chmod 0644 /etc/profile.d/cargo.sh \
 && chmod -R a+rwX /usr/local/rustup /usr/local/cargo \
 && /usr/local/cargo/bin/cargo --version && /usr/local/cargo/bin/rustc --version

# --- Warm Tauri cache: prime the SYSTEM cargo registry so the first `tauri dev`
# skips crate downloads. `cargo fetch` only (not `cargo build`) to keep the image
# lean. Writes into /usr/local/cargo/registry, which persists (unlike ~/.cargo).
COPY pipilot-desktop-template/tauri-warm /tmp/tauri-warm
RUN cd /tmp/tauri-warm/src-tauri \
 && /usr/local/cargo/bin/cargo fetch \
 && chmod -R a+rwX /usr/local/cargo \
 && rm -rf /tmp/tauri-warm

USER user
WORKDIR /home/user/app
