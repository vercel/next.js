import { GraphQLClient } from "graphql-request";

export const gqlClient = new GraphQLClient(process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL!, { fetch });
