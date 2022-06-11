FROM node:18-alpine

WORKDIR /app

# Copy lock files if file exists
COPY package.json yarn.lock* package-lock.json* .

RUN yarn install

COPY src ./src
COPY public ./public
COPY next.config.js .
COPY tsconfig.json .

CMD yarn dev
