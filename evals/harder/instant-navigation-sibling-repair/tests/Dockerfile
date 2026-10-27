FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && useradd --create-home --shell /bin/bash agent \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY fixture/package.json fixture/package-lock.json ./
RUN npm ci
COPY fixture/ ./

WORKDIR /tests
COPY package.json package-lock.json ./
RUN npm ci \
  && npx playwright install --with-deps chromium
COPY test.sh instant.spec.ts playwright.config.ts source-check.mjs ./
RUN chmod -R go-rwx /tests

WORKDIR /app
RUN git init \
  && git config user.email evals@vercel.com \
  && git config user.name "Next.js Evals" \
  && git add -A \
  && git commit -m baseline \
  && mkdir -p /opt/eval \
  && git clone --bare . /opt/eval/base.git \
  && chown -R agent:agent /app \
  && chmod -R a-w /opt/eval/base.git
