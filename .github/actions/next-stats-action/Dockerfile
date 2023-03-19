FROM node:16-bullseye

LABEL com.github.actions.name="Next.js PR Stats"
LABEL com.github.actions.description="Compares stats of a PR with the main branch"
LABEL repository="https://github.com/vercel/next-stats-action"

COPY . /next-stats

# Install node_modules
RUN npm i -g pnpm@7.24.3
RUN cd /next-stats && pnpm install --production

RUN git config --global user.email 'stats@localhost'
RUN git config --global user.name 'next stats'

RUN apt update
RUN apt install apache2-utils -y

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
