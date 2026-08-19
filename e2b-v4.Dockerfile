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
# @nubjs/nub ships `nubx`, which replaces `npx` in the command rewriter. The old rewrite sent npx
# to `pnpm dlx`, and that was not merely slow but WRONG: pnpm dlx ALWAYS fetches from the registry,
# so `npx vite build` ran whatever is latest instead of the version the project pins. Measured on
# this very starter:
#   pnpm dlx vite --version   13.4s  ->  vite 8.2.1   (fetched from the registry)
#   nubx     vite --version    1.6s  ->  vite 5.4.21  (the project's installed copy)
# A different MAJOR than the app was written against, with nothing in the output saying so.
#
# pnpm STAYS the package manager. nub's own installer measured SLOWER on the warm path this image
# is built around (2.9s vs pnpm's 1.7s against the baked store), and it runs postinstall build
# scripts by default — not something we want in a sandbox holding the user's provider tokens.
RUN npm install -g npm@latest pnpm@9.15.0 @nubjs/nub@latest \
      wrangler@latest vercel@latest netlify-cli@latest neonctl@latest \
      @anthropic-ai/claude-code@latest \
 && npm cache clean --force \
 && nubx --version

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

# Shadow `npx` itself with `nubx -y`, not just the JS-side rewrite builder-src/api/e2b.mjs
# does for run_command. That rewrite only covers commands the BROWSER builder agent issues
# through run_command — Mission Runners and Crew issue their OWN bash-tool commands straight
# into the sandbox (the Claude Agent SDK's bash tool, running server-side inside here), which
# never pass through that JS layer. Without this, a mission's `npx <cli>` still silently
# fetches latest-from-registry instead of resolving the project's own installed version —
# exactly the bug nubx exists to fix, just missed for every caller except run_command.
# Root, BEFORE the `USER user` switch below — /etc/profile.d is root-owned.
#
# `{ echo ...; echo ...; } > file`, NOT printf '...\n...': E2B's v2 template builder
# silently strips backslash escapes inside RUN-command strings, which would collapse
# printf's \n into a literal "n" — corrupting the shebang into "#!/bin/shnexec ..." and
# failing every invocation with "cannot execute: required file not found". Bit this repo
# before (1ad5ea0); same trap, different file.
RUN mkdir -p /opt/pipilot-bin \
 && { echo '#!/bin/sh'; echo 'exec nubx -y "$@"'; } > /opt/pipilot-bin/npx \
 && chmod -R a+rX /opt/pipilot-bin && chmod a+x /opt/pipilot-bin/npx \
 && echo 'export PATH="/opt/pipilot-bin:$PATH"' > /etc/profile.d/pipilot-nubx.sh \
 && chmod +x /etc/profile.d/pipilot-nubx.sh

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

# Warm nubx and ASSERT it resolves the project's own bin rather than fetching one — that is the
# entire reason it replaces npx. Deliberately a build-time smoke test: if a future nub release stops
# reading a pnpm-installed node_modules, the image fails to build here instead of quietly
# reintroducing "npx runs the wrong major" at runtime. Version-agnostic, so bumping the starter's
# vite does not break the build. Tests the SHIMMED `npx`, not `nubx` directly — that's what every
# caller (run_command, Crew, Mission Runners) actually invokes.
RUN . /etc/profile.d/pipilot-nubx.sh \
 && INSTALLED="$(node -p "require('/home/user/project/node_modules/vite/package.json').version")" \
 && echo "[template] installed vite: $INSTALLED" \
 && npx vite --version | grep -q "vite/$INSTALLED" \
 && echo "[template] npx (shadowed by nubx) resolves the project-local vite — ok"

ENV PATH="/opt/pipilot-bin:/opt/py-venv/bin:/usr/local/lib/node_modules/.bin:$PATH"
EXPOSE 5173 8080
CMD ["/bin/bash"]
