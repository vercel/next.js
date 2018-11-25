# Do the npm install or yarn install in the full image
FROM mhart/alpine-node AS builder
WORKDIR /app
COPY package.json .
RUN yarn install
COPY . .
RUN yarn build && yarn --production

# And then copy over node_modules, etc from that stage to the smaller base image
FROM mhart/alpine-node:base
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
