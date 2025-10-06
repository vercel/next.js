.PHONY: build-development
build-development: ## Build the development docker image.
	docker compose -f docker/development/compose.yaml build

.PHONY: start-development
start-development: ## Start the development docker container.
	docker compose -f docker/development/compose.yaml up -d

.PHONY: stop-development
stop-development: ## Stop the development docker container.
	docker compose -f docker/development/compose.yaml down

.PHONY: build-staging
build-staging: ## Build the staging docker image.
	docker compose -f docker/staging/compose.yaml build

.PHONY: start-staging
start-staging: ## Start the staging docker container.
	docker compose -f docker/staging/compose.yaml up -d

.PHONY: stop-staging
stop-staging: ## Stop the staging docker container.
	docker compose -f docker/staging/compose.yaml down
  
.PHONY: build-production
build-production: ## Build the production docker image.
	docker compose -f docker/production/compose.yaml build

.PHONY: start-production
start-production: ## Start the production docker container.
	docker compose -f docker/production/compose.yaml up -d

.PHONY: stop-production
stop-production: ## Stop the production docker container.
	docker compose -f docker/production/compose.yaml down
