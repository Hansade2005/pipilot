# PiPilot native sandbox template — Native SDK (vercel-labs/native) authoring +
# build runtime. The agent scaffolds real Zig-native-UI apps here (Model-View-Update,
# .native markup) and iterates; cross-platform installers are produced by the public
# build repo (Hansade2005/pipilot-native-builds → build-app.yml), not in this sandbox.
#
# What it provides:
#   - Ubuntu 24.04 (carries GTK4 + WebKitGTK 6.0 dev libs the Native SDK Linux host
#     links: gtk_host.c → -lgtk4 -lwebkitgtk-6.0; resolved via pkg-config)
#   - Node 22 + @native-sdk/cli@0.5.4 (pinned) + gh CLI (push app source to the build repo)
#   - Zig 0.16 toolchain warmed by building the counter starter once (the CLI fetches
#     Zig into ~/.native on first build; baking it makes the agent's first build fast)
#
# Template name: pipilot-native  (deploy via .github/workflows/deploy-native-template.yml)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# System deps: Native SDK Linux host links GTK4 + WebKitGTK 6.0; plus build tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git gnupg xz-utils \
      build-essential pkg-config \
      libgtk-4-dev libwebkitgtk-6.0-dev \
 && rm -rf /var/lib/apt/lists/*

# Node 22 (NodeSource) — required by @native-sdk/cli.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && node --version

# Native SDK CLI (pinned) + GitHub CLI (agent pushes app source to the build repo).
RUN npm install -g @native-sdk/cli@0.5.4 && npm cache clean --force
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# Non-root user.
RUN useradd -m -s /bin/bash user \
 && mkdir -p /home/user/project /home/user/.cache /home/user/.native \
 && chown -R user:user /home/user
USER user
WORKDIR /home/user/project

# Warm the Zig 0.16 toolchain + SDK cache by building the counter starter once.
# `--yes` is MANDATORY: without it `native build` REFUSES to download/use its managed
# Zig 0.16 toolchain non-interactively and aborts ("zig 0.16.0 ... not found on PATH,
# re-run with --yes") — so the toolchain would NEVER bake and every runtime sandbox
# would re-download ~50MB on first build. Runs as `user`, so Zig lands in the runtime
# user's ~/.native and is reused. `|| true` so a transient hiccup never fails the image;
# the final ls prints to the build log whether Zig actually baked.
COPY --chown=user:user native-starter/ /home/user/project/
RUN native validate app.zon || true
RUN native build --yes || true
RUN ls -la /home/user/.native/toolchains/ 2>/dev/null && echo "ZIG TOOLCHAIN BAKED ✓" || echo "WARN: zig toolchain NOT baked — runtime will re-download"

CMD ["/bin/bash"]
