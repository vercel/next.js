ARG PLAYWRIGHT_VERSION=1.58.2
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    jq \
    libnss3-tools \
    zstd \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sfLS https://install-node.vercel.app/v20 | bash -s -- -f

RUN npm i -g corepack@0.31 @napi-rs/cli@2.18.4 && \
    corepack enable && \
    corepack prepare --activate yarn@1.22.19

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /work
