# PiPilot v4 sandbox template — the in-cloud app-builder runtime.
# Web-app dev server (Vite) + headless-deploy provider CLIs. Purpose-built and
# lean: NO Expo/EAS, NO xfce/VNC desktop (those belong to the old image).
#
# What it provides:
#   - Node 20 LTS + pnpm (npm/npx are rewritten -> pnpm by builder-src/api/e2b.mjs)
#   - git, python3/make/g++ (node-gyp safety for arbitrary npm deps the agent adds)
#   - Provider CLIs baked in for the headless-deploy / oneshot path: wrangler,
#     vercel, netlify, neonctl (npm global) + gh, stripe (apt) + supabase (.deb)
#   - A pre-installed React 18 + Vite 5 + Tailwind v4 starter in /home/user/project
#     so the dev server boots fast (node_modules + warm pnpm store).
#
# The dev server + Host-rewriting proxy (:8080 -> Vite :5173) are started at
# runtime by builder-src/api/e2b.mjs. This image only provides the environment.
# Template name: pipilot-v4  (deploy via .github/workflows/deploy-v4-template.yml)
FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true
ENV NODE_ENV=development

# System deps + third-party apt repos (GitHub CLI, Stripe CLI).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git gnupg python3 make g++ \
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

# Supabase CLI (.deb from latest release — not on apt or npm).
RUN ARCH=$(dpkg --print-architecture) \
 && VER=$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | grep -oP '"tag_name": "v\K[^"]+') \
 && curl -fsSL -o /tmp/supabase.deb "https://github.com/supabase/cli/releases/download/v${VER}/supabase_${VER}_linux_${ARCH}.deb" \
 && dpkg -i /tmp/supabase.deb && rm /tmp/supabase.deb

# Node toolchain + provider CLIs (global, on PATH for every user).
RUN npm install -g npm@latest pnpm@9.15.0 \
      wrangler@latest vercel@latest netlify-cli@latest neonctl@latest \
 && npm cache clean --force

# Non-root user + pre-created CLI config dirs (avoid first-write failures).
RUN useradd -m -s /bin/bash user \
 && mkdir -p /home/user/project \
      /home/user/.npm /home/user/.cache /home/user/.config/configstore \
      /home/user/.wrangler /home/user/.vercel /home/user/.netlify /home/user/.config/neonctl \
 && chown -R user:user /home/user

USER user
WORKDIR /home/user/project

# Warm pnpm's store + node_modules with the default starter deps so the first
# dev-server boot is fast. Keep e2b-v4-template/package.json in sync with
# builder-src/src/builder/template.ts STARTER_FILES['package.json'].
COPY --chown=user:user e2b-v4-template/package.json /home/user/project/package.json
RUN pnpm install

ENV PATH="/usr/local/lib/node_modules/.bin:$PATH"
EXPOSE 5173 8080
CMD ["/bin/bash"]
