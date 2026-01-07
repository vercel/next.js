import { GetStaticPathsContext } from "next";
import { StaticPath } from "@sitecore-jss/sitecore-jss-nextjs";
import * as plugins from "temp/sitemap-fetcher-plugins";

export interface SitemapFetcherPlugin {
  /**
   * A function which will be called during page props generation
   */
  exec(context?: GetStaticPathsContext): Promise<StaticPath[]>;
}

export class SitecoreSitemapFetcher {
  /**
   * Generates SitecoreSitemap for given mode (Export / Disconnected Export / SSG)
   * @param {GetStaticPathsContext} context
   */
  async fetch(context?: GetStaticPathsContext): Promise<StaticPath[]> {
    const pluginsList = Object.values(plugins) as SitemapFetcherPlugin[];
    const pluginsResults = await Promise.all(
      pluginsList.map((plugin) => plugin.exec(context)),
    );
    const results = pluginsResults.reduce((acc, cur) => [...acc, ...cur], []);
    return results;
  }
}

export const sitemapFetcher = new SitecoreSitemapFetcher();
