// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { createServer } from "@graphql-yoga/node";

import { getBuiltMesh } from "../../.mesh";

async function buildServer() {
  // retrieve the mesh instance (with configured Envelop plugins)
  const mesh = await getBuiltMesh();
  // pass the Mesh instance to Yoga and configure GraphiQL
  const server = createServer({
    plugins: mesh.plugins,
    graphiql: {
      endpoint: "/api/graphql",
      title: "GraphQL Gateway",
    },
  });

  return server;
}

const server$ = buildServer();

export default async function apiHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return (await server$).requestListener(req, res);
}
