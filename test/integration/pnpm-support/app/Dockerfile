FROM node:16-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

COPY ./next.config.js ./
COPY ./package.json ./package.json

COPY ./.next/standalone ./
COPY ./.next/static ./.next/static

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
