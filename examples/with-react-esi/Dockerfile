FROM cooptilleuls/varnish:6.0-alpine AS varnish

COPY docker/varnish/default.vcl /usr/local/etc/varnish/default.vcl

FROM node:11.5-alpine as node

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . ./
RUN yarn install
RUN yarn build
CMD yarn start
