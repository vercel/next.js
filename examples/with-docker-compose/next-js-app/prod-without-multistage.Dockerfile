FROM node:16-alpine

WORKDIR /app

COPY package.json yarn.lock* .

RUN yarn install --production

COPY src ./src
COPY public ./public
COPY next.config.js .

# Environment variables must be present at build time
# https://github.com/vercel/next.js/discussions/14030
ARG ENV_VARIABLE
ENV ENV_VARIABLE=${ENV_VARIABLE}
ARG NEXT_PUBLIC_ENV_VARIABLE
ENV NEXT_PUBLIC_ENV_VARIABLE=${NEXT_PUBLIC_ENV_VARIABLE}

RUN yarn build

CMD yarn start
