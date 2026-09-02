# syntax=docker.io/docker/dockerfile:1

# buildpack-deps already includes curl, ca-certificates, and git, so we avoid
# apt-get entirely (the arm64 apt mirror, ports.ubuntu.com, is unreliable).
FROM buildpack-deps:noble-scm AS base

RUN curl -sfLS https://install-node.vercel.app/v20.9.0 | bash -s -- -f
RUN npm i -g corepack@0.34.6
RUN corepack enable



FROM base AS pnpm-deploy

WORKDIR /dot-github
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --exclude=actions/*/node_modules \
  actions/next-stats-action actions/next-stats-action
RUN pnpm deploy --filter=next-stats-action --production /next-stats



FROM base AS next-stats-action

LABEL com.github.actions.name="Next.js PR Stats"
LABEL com.github.actions.description="Compares stats of a PR with the main branch"
LABEL repository="https://github.com/vercel/next.js"

RUN git config --global user.email 'stats@localhost' && \
    git config --global user.name 'next stats'

WORKDIR /next-stats

COPY --from=pnpm-deploy /next-stats .

COPY actions/next-stats-action/entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
