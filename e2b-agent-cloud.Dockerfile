# PiPilot Agent Cloud E2B Template
# Combines Claude Code CLI + Playwright with Chromium for autonomous coding agents

FROM node:20-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# Pre-configure keyboard settings to avoid prompts
RUN echo 'keyboard-configuration keyboard-configuration/layout select English (US)' | debconf-set-selections
RUN echo 'keyboard-configuration keyboard-configuration/layoutcode select us' | debconf-set-selections

# Install system dependencies required for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    git \
    ca-certificates \
    fonts-liberation \
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

# Install npm and pnpm globally
RUN npm install -g npm@latest
RUN npm install -g pnpm@9

# Install Claude Agent SDK globally
RUN npm install -g @anthropic-ai/claude-agent-sdk

# Install Playwright globally
RUN npm install -g playwright

# Install CLI tools for connectors (available when user enables them)
RUN npm install -g vercel@latest \
    netlify-cli@latest \
    neonctl@latest \
    wrangler@latest \
    @railway/cli@latest \
    turso@latest

# Create a user with proper setup (matching E2B conventions)
# Idempotent: the E2B v2 build backend can pre-provision a 'user' account itself before
# our Dockerfile RUNs, and a bare `useradd` then fails with "already exists" (exit 9).
RUN (id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user)

# Set up the working directory with proper permissions
# All work happens in /home/user (our PROJECT_DIR)
WORKDIR /home/user

# Initialize npm project and install Playwright + CLI tools locally
# This ensures they're accessible from the working directory without global path issues
RUN npm init -y && npm install playwright

# Install Playwright browsers with system dependencies (as root for full access)
# PLAYWRIGHT_BROWSERS_PATH=0 installs browsers in node_modules (accessible by all users)
RUN PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium

# Pre-create all CLI config directories so tools don't fail on first write
RUN mkdir -p \
    /home/user/.npm \
    /home/user/.cache \
    /home/user/.claude \
    /home/user/.vercel \
    /home/user/.netlify \
    /home/user/.wrangler \
    /home/user/.railway \
    /home/user/.config/turso \
    /home/user/.config/neonctl \
    /home/user/.config/configstore

# Set up CLI tool auth files with placeholder structure (tokens injected at runtime)
RUN echo '{}' > /home/user/.vercel/credentials.json \
    && echo '{}' > /home/user/.netlify/config.json \
    && echo '{}' > /home/user/.config/turso/config.json

# Give full permissions to the user on the entire working directory tree
# This ensures all CLI tools can read/write their config without permission errors
RUN chmod -R a+rwX /home/user && chown -R user:user /home/user

# Switch to user for runtime
USER user
WORKDIR /home/user

# Set environment variables
ENV NODE_ENV=development
ENV PLAYWRIGHT_BROWSERS_PATH=0
# Ensure global npm binaries are in PATH for the user
ENV PATH="/usr/local/lib/node_modules/.bin:$PATH"

# Expose common development ports
EXPOSE 3000 5173 8080

# Default command
CMD ["/bin/bash"]
