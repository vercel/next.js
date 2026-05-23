# syntax=docker.io/docker/dockerfile:1
# Loosely based on:
# https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.noble

FROM ubuntu:noble

ARG NODE_VERSION=20.9.0
ARG PLAYWRIGHT_VERSION
ARG IMAGE_NAME_TEMPLATE=ghcr.io/vercel/next.js-playwright-chromium:v%version%-noble-r1

ENV DEBIAN_FRONTEND=noninteractive
ENV FNM_DIR=/usr/local/share/fnm
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PATH=/usr/local/share/fnm:$PATH
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV TZ=Etc/UTC
ENV FNM_VERSION=v1.39.0
ENV FNM_SHA256=7807664f39d39fc518da1c35ba0181e4b3267603c4b1dedeb4b5fc6ae440a224
ENV FNM_PATH=/usr/bin/fnm

RUN test -n "${NODE_VERSION}" && \
    test -n "${PLAYWRIGHT_VERSION}" && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      curl \
      git \
      jq \
      openssh-client \
      unzip \
      wget && \
    curl -L --fail --retry 2 -o /tmp/fnm-linux.zip \
      "https://github.com/Schniz/fnm/releases/download/$FNM_VERSION/fnm-linux.zip" && \
    echo "$FNM_SHA256  /tmp/fnm-linux.zip" | sha256sum --check --status && \
    unzip /tmp/fnm-linux.zip fnm  -d "$(dirname "$FNM_PATH")" && \
    rm /tmp/fnm-linux.zip && \
    chmod +x "$FNM_PATH" && \
    fnm install "$NODE_VERSION" && \
    fnm default "$NODE_VERSION"

# put chrome in a separate layer to get some benefits from parallel pulling
RUN eval "$(fnm env)" && \
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
    chown -R pwuser:pwuser "$FNM_DIR" /home/pwuser
