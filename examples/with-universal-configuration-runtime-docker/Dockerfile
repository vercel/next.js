FROM node:9-slim AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM node:9-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
CMD npm start
