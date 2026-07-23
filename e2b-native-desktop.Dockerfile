# PiPilot Native Desktop E2B Template — LIVE preview of a running Native SDK app.
#
# The Native SDK links GTK4 + WebKitGTK 6.0, which need Ubuntu 24.04 (the standard
# E2B desktop base is 22.04 = GTK3/webkit2gtk-4.1), so this replicates the E2B desktop
# stack (XFCE + Xvfb + x11vnc + noVNC on :6080) on 24.04 and adds the Native SDK
# toolchain. `native dev` builds + opens the app's GTK4 window on Xvfb (:0), which
# x11vnc → noVNC streams to the browser preview.
#
# Streaming model (same as pipilot-desktop): XFCE renders on Xvfb :0 → x11vnc on :5900
# → noVNC/websockify on :6080. Boot via `-c "/start_command.sh"`.
#
# Template name: pipilot-native-desktop  (deploy via deploy-native-desktop-template.yml)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# Desktop stack: XFCE + Xvfb + x11vnc + utilities.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      xserver-xorg xorg x11-xserver-utils xvfb x11-utils xauth \
      xfce4 xfce4-goodies util-linux sudo curl git wget python3 ca-certificates \
      xdotool scrot x11vnc dbus-x11 net-tools \
 && rm -rf /var/lib/apt/lists/*

# noVNC (E2B fork) + websockify for the browser-facing VNC bridge on :6080.
RUN git clone --branch e2b-desktop https://github.com/e2b-dev/noVNC.git /opt/noVNC \
 && ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html \
 && git clone --branch v0.12.0 https://github.com/novnc/websockify /opt/noVNC/utils/websockify
RUN ln -sf /usr/bin/xfce4-terminal.wrapper /etc/alternatives/x-terminal-emulator || true

# Node 22 + Native SDK toolchain (GTK4 + WebKitGTK 6.0 dev libs the app links).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g @native-sdk/cli@0.5.4 && npm cache clean --force

# noVNC bring-up script (Xvfb -> XFCE -> x11vnc -> noVNC :6080).
COPY start_command.sh /start_command.sh
RUN sed -i 's/\r$//' /start_command.sh && chmod +x /start_command.sh

# Non-root user + warm the Zig 0.16 toolchain + SDK by building the counter starter.
RUN useradd -m -s /bin/bash user \
 && mkdir -p /home/user/app /home/user/.cache /home/user/.native \
 && chown -R user:user /home/user
COPY --chown=user:user native-starter/ /home/user/app/
USER user
WORKDIR /home/user/app
# `--yes` is MANDATORY — without it `native build` refuses to fetch/use its managed Zig
# 0.16 toolchain non-interactively, so nothing bakes and every preview re-downloads ~50MB.
# Runs as `user` → Zig lands in the runtime user's ~/.native and is reused by `native dev`.
# Bake ALL of it at once so the Live-native preview + screenshots start cold-free: Zig 0.16,
# the default build (native dev), and the automation build (native_screenshot). Builds are
# headless (no display needed at image-build time; only RUNNING the app needs Xvfb).
RUN sh -c 'native validate app.zon || true'
RUN sh -c 'native build --yes || true'
RUN sh -c 'native build --yes -Dautomation=true || true'
RUN ls -la /home/user/.native/toolchains/ 2>/dev/null && echo "ZIG TOOLCHAIN BAKED ✓" || echo "WARN: zig toolchain NOT baked — preview will re-download"
USER root

CMD ["/bin/bash"]
