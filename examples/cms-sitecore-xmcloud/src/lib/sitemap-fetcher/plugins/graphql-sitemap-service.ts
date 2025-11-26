import {
  GraphQLSitemapService,
  StaticPath,
  constants,
} from "@sitecore-jss/sitecore-jss-nextjs";
import config from "temp/config";
import { SitemapFetcherPlugin } from "..";
import { GetStaticPathsContext } from "next";

class GraphqlSitemapServicePlugin implements SitemapFetcherPlugin {
  _graphqlSitemapService: GraphQLSitemapService;

  constructor() {
    this._graphqlSitemapService = new GraphQLSitemapService({
      endpoint: config.graphQLEndpoint,
      apiKey: config.sitecoreApiKey,
      siteName: config.jssAppName,
    });
  }

  async exec(context?: GetStaticPathsContext): Promise<StaticPath[]> {
    if (process.env.JSS_MODE === constants.JSS_MODE.DISCONNECTED) {
      return [];
    }
    return process.env.EXPORT_MODE
      ? this._graphqlSitemapService.fetchExportSitemap(config.defaultLanguage)
      : this._graphqlSitemapService.fetchSSGSitemap(context?.locales || []);
  }
}

export const graphqlSitemapServicePlugin = new GraphqlSitemapServicePlugin();
