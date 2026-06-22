FROM node:25-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# Pre-configure keyboard settings to avoid prompts
RUN echo 'keyboard-configuration keyboard-configuration/layout select English (US)' | debconf-set-selections
RUN echo 'keyboard-configuration keyboard-configuration/layoutcode select us' | debconf-set-selections

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    git \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js dependencies with versions compatible with Node.js 25
RUN npm install -g npm@11.0.0
RUN npm install -g pnpm@9.15.0
# Yarn is already included in Node.js 25 Docker image
RUN npm install -g @expo/cli@latest
RUN npm install -g eas-cli@latest

# GitHub CLI (gh) — mission runners on this template (web->mobile conversion etc.)
# use `gh repo create`/push. Static binary to /usr/local/bin (on PATH for every
# user) + verify so it can never silently miss the way it did before.
RUN ARCH=$(dpkg --print-architecture) \
 && curl -fsSL -o /tmp/gh.tgz "https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_${ARCH}.tar.gz" \
 && tar -xzf /tmp/gh.tgz -C /tmp \
 && install -m 0755 /tmp/gh_2.62.0_linux_${ARCH}/bin/gh /usr/local/bin/gh \
 && rm -rf /tmp/gh.tgz /tmp/gh_2.62.0_linux_* \
 && gh --version

# Clean npm cache to prevent corruption
RUN npm cache clean --force

# Set up Python environment
RUN python3 -m pip install --upgrade pip --break-system-packages

# Install desktop environment components
RUN apt-get update && apt-get install -y \
    xfce4 \
    xfce4-goodies \
    tightvncserver \
    && rm -rf /var/lib/apt/lists/*

# Create a user with proper setup like E2B Expo template
RUN useradd -m -s /bin/bash user

# Create necessary directories with correct ownership before switching user
RUN mkdir -p /home/user/.expo /home/user/.npm /home/user/.cache \
    && chown -R user:user /home/user

USER user

# Set working directory to user home like E2B Expo template
WORKDIR /home/user

# Copy package files for dependency installation
COPY --chown=user:user e2b-template/package.json ./
COPY --chown=user:user e2b-template/pnpm-lock.yaml* ./

# Install Node.js dependencies
RUN pnpm install

# Set environment variables
ENV DISPLAY=:99
ENV NODE_ENV=development

# Expose port for VNC if needed
EXPOSE 5900

# Default command
CMD ["/bin/bash"]
