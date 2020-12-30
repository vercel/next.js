db:
	docker-compose down --remove-orphans
	docker-compose up -d postgres
	docker-compose up -d graphql-engine
	sleep 3
	yarn hasura migrate apply
	yarn hasura metadata apply
