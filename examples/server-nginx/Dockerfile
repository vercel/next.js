FROM node:12-alpine

ENV NODE_ENV=production

EXPOSE 80
EXPOSE 3000
ENTRYPOINT ["/init"]

# s6-supervisor
RUN wget -O /tmp/s6-overlay-amd64.tar.gz https://github.com/just-containers/s6-overlay/releases/download/v1.22.1.0/s6-overlay-amd64.tar.gz
RUN tar xzf /tmp/s6-overlay-amd64.tar.gz -C /
ADD ./.docker/services/ /etc/services.d

# user for running the app
RUN adduser -h /usr/local/app -S -D app
WORKDIR /usr/local/app

# install nginx + config
RUN apk --update add --no-cache -ul nginx nginx-mod-http-lua luajit musl musl-utils &&\
    mkdir /run/nginx
ADD ./.docker/nginx/ /etc/nginx

# app dependencies
ADD package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# build the app and compress static assets
ADD . .
RUN yarn build &&\
    cp .next/BUILD_ID /etc/services.d/nginx/env &&\
    find /usr/local/app/.next/static -type f -print0 | xargs -0r gzip -k &&\
    find /usr/local/app/.next/server/static -type f -print0 | xargs -0r gzip -k
