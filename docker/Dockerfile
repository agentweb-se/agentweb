FROM node:20-slim

# Install Puppeteer system dependencies for headless Chrome
# node:20-slim is Debian Bookworm — uses non-t64 package names
RUN apt-get update && apt-get install -y \
  ca-certificates \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Output directory is volume-mounted at runtime
ENV OUTPUT_DIR=/app/output
ENV PORT=4001

EXPOSE 4001

CMD ["npx", "tsx", "src/index.ts"]
