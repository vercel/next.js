import { GraphQLClient } from "graphql-request";
export { gql } from "graphql-request";

export const grafbase = new GraphQLClient(
  process.env.GRAFBASE_API_URL as string,
  {
    headers: {
      "x-api-key": process.env.GRAFBASE_API_KEY as string,
    },
    fetch,
  },
);
