# syntax=docker.io/docker/dockerfile:1
# Loosely based on:
# https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.noble

FROM ubuntu:noble

ARG NODE_VERSION=20.9.0
ARG PLAYWRIGHT_VERSION
ARG IMAGE_NAME_TEMPLATE=ghcr.io/vercel/next.js-playwright-chromium:v%version%-noble-r2

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV NVM_DIR=/usr/local/share/nvm
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV TZ=Etc/UTC
# https://github.com/nvm-sh/nvm/releases/tag/v0.40.4
ENV NVM_COMMIT=62387b8f92aa012d48202747fd75c40850e5e261

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN test -n "${NODE_VERSION}" && \
    test -n "${PLAYWRIGHT_VERSION}" && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      curl \
      git \
      openssh-client \
      wget && \
    mkdir -p "$NVM_DIR" && \
    curl -L --fail --retry 3 \
      "https://github.com/nvm-sh/nvm/archive/$NVM_COMMIT.tar.gz" \
      | tar -xz -C "$NVM_DIR" --strip-components=1 && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install "$NODE_VERSION" && \
    nvm alias default "$NODE_VERSION"

# put chrome in a separate layer to get some benefits from parallel pulling
RUN . "$NVM_DIR/nvm.sh" && \
    npm install -g yarn && \
    mkdir -p /ms-playwright /ms-playwright-agent && \
    cd /ms-playwright-agent && \
    npm init -y && \
    npm i "playwright-core@$PLAYWRIGHT_VERSION" && \
    npm exec --no -- playwright-core mark-docker-image "$IMAGE_NAME_TEMPLATE" && \
    npm exec --no -- playwright-core install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/* /ms-playwright-agent ~/.npm && \
    chmod -R 777 /ms-playwright && \
    useradd --uid 1001 --create-home --shell /bin/bash pwuser && \
    chown -R pwuser:pwuser "$NVM_DIR" /home/pwuser
