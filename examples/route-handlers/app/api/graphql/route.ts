import { createYoga } from "graphql-yoga";
import { schema } from "@/lib/schema";

const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

function handler(request: Request) {
  return handleRequest(request, {});
}

export { handler as GET, handler as POST, handler as OPTIONS };
