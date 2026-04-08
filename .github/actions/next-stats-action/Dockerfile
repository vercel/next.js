# syntax=docker.io/docker/dockerfile:1

FROM ubuntu:24.04

LABEL com.github.actions.name="Next.js PR Stats"
LABEL com.github.actions.description="Compares stats of a PR with the main branch"
LABEL repository="https://github.com/vercel/next-stats-action"

ENV DEBIAN_FRONTEND=noninteractive

# use apt-get instead of apt, because apt does not have a stable CLI interface
RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y --no-install-recommends curl ca-certificates git

RUN curl -sfLS https://install-node.vercel.app/v20.9.0 | bash -s -- -f
RUN npm i -g corepack@0.34.6
RUN corepack enable

WORKDIR /next-stats

# Install node_modules
COPY package.json ./
RUN pnpm install --production

# Do this copy after the pnpm install to optimize docker caching
COPY --exclude=node_modules . .

RUN git config --global user.email 'stats@localhost' && \
    git config --global user.name 'next stats'

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
