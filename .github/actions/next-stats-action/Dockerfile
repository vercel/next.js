# syntax=docker.io/docker/dockerfile:1

FROM ubuntu:24.04 AS base

# use apt-get instead of apt, because apt does not have a stable CLI interface
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y --no-install-recommends curl ca-certificates git

RUN curl -sfLS https://install-node.vercel.app/v20.9.0 | bash -s -- -f
RUN npm i -g corepack@0.34.6
RUN corepack enable



FROM base AS pnpm-deploy

WORKDIR /dot-github
COPY --exclude=node_modules --exclude=actions/*/node_modules . .
RUN ls -l
RUN pnpm deploy --filter=next-stats-action --production /next-stats



FROM base AS next-stats-action

LABEL com.github.actions.name="Next.js PR Stats"
LABEL com.github.actions.description="Compares stats of a PR with the main branch"
LABEL repository="https://github.com/vercel/next.js"

RUN git config --global user.email 'stats@localhost' && \
    git config --global user.name 'next stats'

WORKDIR /next-stats

COPY --from=pnpm-deploy /next-stats .
RUN pnpm install --production

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
