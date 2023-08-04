FROM node:18.14-alpine AS build

WORKDIR /app

COPY package* yarn.lock ./
COPY prisma ./prisma/
COPY tsconfig.json ./
COPY . .
RUN yarn install --frozen-lockfile
RUN npx prisma generate
RUN yarn build

FROM node:18.14-alpine

WORKDIR /app

RUN apk add openssl
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/prisma /app/prisma
COPY --from=build /app/dist /app/dist
RUN npx prisma generate
CMD ["yarn", "start"]