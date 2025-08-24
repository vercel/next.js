import type { NextApiRequest, NextApiResponse } from "next";
import { GraphQLRobotsService } from "@sitecore-jss/sitecore-jss-nextjs";
import { siteResolver } from "lib/site-resolver";
import config from "temp/config";

const robotsApi = async (
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> => {
  // Ensure response is text/html
  res.setHeader("Content-Type", "text/html;charset=utf-8");

  // Resolve site based on hostname
  const hostName = req.headers["host"]?.split(":")[0] || "localhost";
  const site = siteResolver.getByHost(hostName);

  // create robots graphql service
  const robotsService = new GraphQLRobotsService({
    endpoint: config.graphQLEndpoint,
    apiKey: config.sitecoreApiKey,
    siteName: site.name,
  });

  const robotsResult = await robotsService.fetchRobots();

  return res.status(200).send(robotsResult);
};

export default robotsApi;
