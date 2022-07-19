FROM node:18-alpine

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  [ -f package-lock.json ] && npm install || \
  [ -f pnpm-lock.yaml ] && yarn global add pnpm && pnpm install || \
  yarn install

COPY src ./src
COPY public ./public
COPY next.config.js .
COPY tsconfig.json .

CMD yarn dev
