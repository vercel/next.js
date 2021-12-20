  
FROM node:16-alpine

WORKDIR /app

# Optionally copy `yarn.lock` if file exists
COPY package.json yarn.lock* .

RUN yarn install

COPY src ./src
COPY public ./public
COPY next.config.js .

CMD yarn dev
