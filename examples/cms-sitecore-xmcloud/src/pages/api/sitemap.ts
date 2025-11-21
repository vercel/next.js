import type { NextApiRequest, NextApiResponse } from "next";
import {
  AxiosDataFetcher,
  GraphQLSitemapXmlService,
  getPublicUrl,
  AxiosResponse,
} from "@sitecore-jss/sitecore-jss-nextjs";
import { siteResolver } from "lib/site-resolver";
import config from "temp/config";

const ABSOLUTE_URL_REGEXP = "^(?:[a-z]+:)?//";

const sitemapApi = async (
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<NextApiResponse | void> => {
  const {
    query: { id },
  } = req;

  // Resolve site based on hostname
  const hostName = req.headers["host"]?.split(":")[0] || "localhost";
  const site = siteResolver.getByHost(hostName);

  // create sitemap graphql service
  const sitemapXmlService = new GraphQLSitemapXmlService({
    endpoint: config.graphQLEndpoint,
    apiKey: config.sitecoreApiKey,
    siteName: site.name,
  });

  // if url has sitemap-{n}.xml type. The id - can be null if it's sitemap.xml request
  const sitemapPath = await sitemapXmlService.getSitemap(id as string);

  // if sitemap is match otherwise redirect to 404 page
  if (sitemapPath) {
    const isAbsoluteUrl = sitemapPath.match(ABSOLUTE_URL_REGEXP);
    const sitemapUrl = isAbsoluteUrl
      ? sitemapPath
      : `${config.sitecoreApiHost}${sitemapPath}`;
    res.setHeader("Content-Type", "text/xml;charset=utf-8");

    // need to prepare stream from sitemap url
    return new AxiosDataFetcher()
      .get(sitemapUrl, {
        responseType: "stream",
      })
      .then((response: AxiosResponse) => {
        response.data.pipe(res);
      })
      .catch(() => res.redirect("/404"));
  }

  // this approache if user go to /sitemap.xml - under it generate xml page with list of sitemaps
  const sitemaps = await sitemapXmlService.fetchSitemaps();

  if (!sitemaps.length) {
    return res.redirect("/404");
  }

  const SitemapLinks = sitemaps
    .map((item) => {
      const parseUrl = item.split("/");
      const lastSegment = parseUrl[parseUrl.length - 1];

      return `<sitemap>
        <loc>${getPublicUrl()}/${lastSegment}</loc>
      </sitemap>`;
    })
    .join("");

  res.setHeader("Content-Type", "text/xml;charset=utf-8");

  return res.send(`
  <sitemapindex xmlns="http://sitemaps.org/schemas/sitemap/0.9" encoding="UTF-8">${SitemapLinks}</sitemapindex>
  `);
};

export default sitemapApi;
