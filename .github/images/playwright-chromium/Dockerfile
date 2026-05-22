# syntax=docker.io/docker/dockerfile:1
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

RUN apt-get update && \
    test -n "${NODE_VERSION}" && \
    test -n "${PLAYWRIGHT_VERSION}" && \
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
    curl -fsSL https://fnm.vercel.app/install | bash && \
    fnm install "${NODE_VERSION}" && \
    fnm default "${NODE_VERSION}" && \
    eval "$(fnm env)" && \
    npm install -g yarn && \
    mkdir -p /ms-playwright /ms-playwright-agent && \
    cd /ms-playwright-agent && \
    npm init -y && \
    npm i "playwright-core@${PLAYWRIGHT_VERSION}" && \
    npm exec --no -- playwright-core mark-docker-image "${IMAGE_NAME_TEMPLATE}" && \
    npm exec --no -- playwright-core install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/* /ms-playwright-agent ~/.npm && \
    chmod -R 777 /ms-playwright && \
    useradd --uid 1001 --create-home --shell /bin/bash pwuser && \
    chown -R pwuser:pwuser "${FNM_DIR}" /home/pwuser
