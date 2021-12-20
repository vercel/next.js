#!/usr/bin/env bash

if [ ! -f .env ]; then
    cp .env.example .env
fi

# Create a bridge network, which allows containers to communicate with each other, 
# by using their container name as a hostname
docker network create my_network

# Build dev using new BuildKit engine
COMPOSE_DOCKER_CLI_BUILD=1 \
DOCKER_BUILDKIT=1 \
docker-compose -f docker-compose.dev.yml build

# Up dev
docker-compose -f docker-compose.dev.yml up
