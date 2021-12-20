#!/usr/bin/env sh

if [ ! -f .env ]; then
    cp .env.example .env
fi

# Create a bridge network, which allows containers to communicate with each other, 
# by using their container name as a hostname
docker network create my_network

# Build prod using new BuildKit engine
COMPOSE_DOCKER_CLI_BUILD=1 \
DOCKER_BUILDKIT=1 \
docker-compose -f docker-compose.prod.yml build --parallel

# Up prod in detached mode
docker-compose -f docker-compose.prod.yml up -d
