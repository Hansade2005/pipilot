# PiPilot Playwright Chromium E2B Template
# Lightweight template for browser automation with Playwright and Chromium
# Alias: playwright-chromium

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

# Set up working directory for the app
WORKDIR /app

# Initialize a new Node.js project
RUN npm init -y

# Install Playwright Node.js package
RUN npm install playwright

# Install Playwright browsers and system dependencies
# PLAYWRIGHT_BROWSERS_PATH=0 installs browsers in node_modules (accessible by all users)
RUN PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium

# Allow all users to write output files in /app
RUN chmod a+rwX /app

# Create a user with proper setup (matching E2B conventions)
RUN useradd -m -s /bin/bash user

# Give full permissions to the user on their home directory
RUN chmod -R a+rwX /home/user && chown -R user:user /home/user

# Switch to non-root user for runtime
USER user
WORKDIR /home/user

# Set environment variables
ENV NODE_ENV=development
ENV PLAYWRIGHT_BROWSERS_PATH=0

# Default command
CMD ["/bin/bash"]
