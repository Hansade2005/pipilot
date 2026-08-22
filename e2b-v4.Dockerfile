# PiPilot v4 sandbox template — the in-cloud app-builder runtime.
# Web-app dev server (Vite) + headless-deploy provider CLIs. Purpose-built and
# lean: NO Expo/EAS, NO xfce/VNC desktop (those belong to the old image).
#
# What it provides:
#   - Node 22 LTS + pnpm + nubx (npm -> pnpm and npx -> nubx, both rewritten by
#     builder-src/api/e2b.mjs)
#     22.x is required: wrangler (+ other deploy CLIs) want Node 20+/22+; 20 was
#     too old for our target and 25 (the old image) was non-LTS and broke wrangler.
#   - git, python3/make/g++ (node-gyp safety for arbitrary npm deps the agent adds)
#   - Provider CLIs baked in for the headless-deploy / oneshot path: wrangler,
#     vercel, netlify, neonctl (npm global) + gh, stripe (apt) + supabase (.deb)
#   - A pre-installed React 18 + Vite 5 + Tailwind v4 starter in /home/user/project
#     so the dev server boots fast (node_modules + warm pnpm store).
#   - A pre-baked Python venv at /opt/py-venv (PATH-first, so bare `python3`/`pip`
#     just work) with the doc/canvas-generation skills' packages pre-installed —
#     the base image ships only bare python3 (no pip/ensurepip/venv, no sudo for
#     the non-root `user`), which otherwise strands every Python-based skill
#     (canvas-design, pdf-documents, pptx-documents) with "No module named pip"
#     and no way to self-heal at runtime. See poppler-utils below for pdftoppm/
#     pdftotext; LibreOffice is deliberately NOT baked in (too heavy) — the pptx
#     skill degrades gracefully (markitdown + validate.py) when soffice is absent.
#
# The dev server + Host-rewriting proxy (:8080 -> Vite :5173) are started at
# runtime by builder-src/api/e2b.mjs. This image only provides the environment.
# Template name: pipilot-v4  (deploy via .github/workflows/deploy-v4-template.yml)
FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true
ENV NODE_ENV=development

# System deps + third-party apt repos (GitHub CLI, Stripe CLI). python3-venv (pip lives
# inside the venv we create below, not system-wide) + poppler-utils (pdftoppm/pdftotext/
# pdfimages — used by the pdf-documents/pptx-documents skills' QA + extraction steps).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git gnupg python3 python3-venv make g++ poppler-utils \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && curl -fsSL https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public \
      | gpg --dearmor | tee /usr/share/keyrings/stripe.gpg >/dev/null \
 && echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" \
      > /etc/apt/sources.list.d/stripe.list \
 && apt-get update && apt-get install -y --no-install-recommends gh stripe \
 && rm -rf /var/lib/apt/lists/*

# Supabase CLI — versionless `/latest/download/` tarball (no API call / version
# parse, so no rate-limit or locale flakiness). Extract just the binary to PATH.
RUN ARCH=$(dpkg --print-architecture) \
 && curl -fsSL -o /tmp/supabase.tgz "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${ARCH}.tar.gz" \
 && tar -xzf /tmp/supabase.tgz -C /usr/local/bin supabase \
 && rm /tmp/supabase.tgz \
 && supabase --version

# Node toolchain + provider CLIs (global, on PATH for every user) + Claude Code
# (so this same template powers Mission Runners — headless `claude` agents that
# also need the deploy CLIs below).
# @nubjs/nub REMOVED — see the note at the old npx-shim site further down for why (it corrupted
# module resolution on real projects with runtime-installed deps). Not just unshimmed but
# uninstalled entirely: leaving `nub` on PATH is itself a hazard, since an agent that notices it
# there has been known to call it directly (`nub install`) even when told not to, with the same
# failure mode as the shim. pnpm remains the only package manager in this image.
RUN npm install -g npm@latest pnpm@9.15.0 \
      wrangler@latest vercel@latest netlify-cli@latest neonctl@latest \
      @anthropic-ai/claude-code@latest \
 && npm cache clean --force

# Python venv for the doc/canvas-generation skills (canvas-design, pdf-documents,
# pptx-documents) — pre-warmed at BUILD time so no sandbox ever pays the pip-install
# cost or hits the missing-pip/no-sudo wall. `--system-site-packages` off (default):
# fully isolated, no PEP 668 externally-managed-environment friction.
#
# run_command always invokes `bash -lc` (a LOGIN shell) — see builder-src/api/e2b.mjs
# — which sources /etc/profile, and on Debian that UNCONDITIONALLY resets PATH to
# the base list, wiping any Docker ENV PATH before the shell even runs the command.
# /etc/profile.d/*.sh scripts run AFTER that reset (Debian's /etc/profile sources
# them in a loop), so exporting PATH there is what actually survives.
#
# Do NOT symlink python3/pip from /usr/local/bin into the venv instead — that's a
# real footgun: invoking a venv's interpreter through a symlink OUTSIDE its own
# bin/ directory breaks CPython's pyvenv.cfg venv-detection (sys.executable no
# longer resolves to a path inside /opt/py-venv/, so it silently falls back to the
# BARE system interpreter with none of the venv's packages — verified empirically:
# `/usr/local/bin/python3` (symlinked) → ModuleNotFoundError, `/opt/py-venv/bin/
# python3` (invoked directly, found via PATH) → imports fine). Only a PATH edit
# that resolves to the real file inside the venv's own directory works.
RUN python3 -m venv /opt/py-venv \
 && /opt/py-venv/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/py-venv/bin/pip install --no-cache-dir \
      pillow pypdf pdfplumber pypdfium2 reportlab pandas openpyxl \
      python-pptx defusedxml lxml "markitdown[pptx]" \
 && echo 'export PATH="/opt/py-venv/bin:$PATH"' > /etc/profile.d/py-venv.sh \
 && chmod +x /etc/profile.d/py-venv.sh

# REVERTED: this used to shadow `npx` with `nubx -y` for every shell, so Mission Runner/Crew
# bash-tool commands (which bypass the JS-side rewrite in builder-src/api/e2b.mjs entirely —
# see the removed comment this replaced) also resolved the project-local package. Removed after
# a real build on the SISTER pipilot-expo template proved this class of shim corrupts module
# resolution: nub maintains its own `.nub` virtual store that diverges from the prebaked pnpm
# tree, and once a project has real runtime-installed dependencies, Node's require() cannot
# follow the resulting symlink chain — silent, total breakage a shallow build-time smoke test
# (`nubx --version` resolving) never caught. Root cause is generic to nub, not Expo-specific, so
# reverted here too rather than waiting for the same failure to show up in a web mission.

# Mission Runner / Crew stream server deps (express, the Claude Agent SDK, zod), baked so
# api/e2b.mjs's mission_stream setup finds them already installed instead of pnpm-installing on
# every cold start. Separate /opt prefix, same reason as everything else here: kept out of the
# project's own tree so an agent's `pnpm install` in /home/user/project can never touch it.
# api/e2b.mjs still PROBES `tool`/`createSdkMcpServer` at runtime and reinstalls if a baked
# version ever goes stale, so this is a pure cold-start speed win, not a hard pin.
RUN mkdir -p /opt/pipilot-stream && cd /opt/pipilot-stream \
 && echo '{"type":"module"}' > package.json \
 && npm install express @anthropic-ai/claude-agent-sdk zod \
 && chmod -R a+rX /opt/pipilot-stream

# Build-time assertion, same spirit as the nubx check above: fail the image here if the baked
# SDK doesn't export the custom-tool API the stream server needs, rather than finding out at a
# live mission's first dispatch.
RUN cd /opt/pipilot-stream && node -e "import('@anthropic-ai/claude-agent-sdk').then(m=>{if(!m.tool||!m.createSdkMcpServer){console.error('[template] baked claude-agent-sdk is missing tool/createSdkMcpServer exports');process.exit(1)}console.log('[template] baked claude-agent-sdk exports tool+createSdkMcpServer - ok')})"

# Non-root user + pre-created CLI config dirs (avoid first-write failures).
# Idempotent: the E2B v2 build backend can pre-provision a 'user' account itself
# before our Dockerfile RUNs — a bare `useradd` then fails with "already exists"
# (exit 9). Only create it if missing; -m/mkdir -p/chown are already idempotent.
RUN (id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user) \
 && mkdir -p /home/user/project \
      /home/user/.npm /home/user/.cache /home/user/.config/configstore \
      /home/user/.wrangler /home/user/.vercel /home/user/.netlify /home/user/.config/neonctl \
 && chown -R user:user /home/user /opt/py-venv

USER user
WORKDIR /home/user/project

# Warm pnpm's store + node_modules with the default starter deps so the first
# dev-server boot is fast. Keep e2b-v4-template/package.json in sync with
# builder-src/src/builder/template.ts STARTER_FILES['package.json'].
COPY --chown=user:user e2b-v4-template/package.json /home/user/project/package.json
RUN pnpm install

# Plain-npx build-time smoke test (nubx removed — see the reverted-shim note above): confirm the
# starter's own npx resolves the project-local vite rather than something unexpected. Version-
# agnostic, so bumping the starter's vite does not break the build.
RUN INSTALLED="$(node -p "require('/home/user/project/node_modules/vite/package.json').version")" \
 && echo "[template] installed vite: $INSTALLED" \
 && cd /home/user/project && npx vite --version | grep -q "vite/$INSTALLED" \
 && echo "[template] npx resolves the project-local vite — ok"

ENV PATH="/opt/py-venv/bin:/usr/local/lib/node_modules/.bin:$PATH"
EXPOSE 5173 8080
CMD ["/bin/bash"]
