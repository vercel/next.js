import type { NextApiRequest, NextApiResponse } from "next";
import { createYoga } from "graphql-yoga";
import { schema } from "@/lib/schema";

export const config = {
  api: {
    // GraphQL Yoga parses the request body itself.
    bodyParser: false,
  },
};

export default createYoga<{ req: NextApiRequest; res: NextApiResponse }>({
  schema,
  graphqlEndpoint: "/api/graphql",
});
