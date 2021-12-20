#!/usr/bin/env sh

if [ ! -f .env ]; then
    cp .env.example .env
fi

# Create a bridge network, which allows containers to communicate with each other, 
# by using their container name as a hostname
docker network create my_network

# Build prod without multistage using new BuildKit engine
COMPOSE_DOCKER_CLI_BUILD=1 \
DOCKER_BUILDKIT=1 \
docker-compose -f docker-compose.prod-without-multistage.yml build --parallel

# Up prod without multistage in detached mode
docker-compose -f docker-compose.prod-without-multistage.yml up -d
