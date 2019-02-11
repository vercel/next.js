FROM node:8.11.1-alpine AS base

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

# Install package dependencies
RUN yarn global add firebase-tools @google-cloud/functions-emulator  --ignore-engines

RUN mkdir /app
WORKDIR /app
