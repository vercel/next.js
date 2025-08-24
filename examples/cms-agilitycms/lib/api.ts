import agility from "@agility/content-fetch";
import { CMS_LANG, CMS_CHANNEL } from "./constants";
import { asyncForEach } from "./utils";
export { validatePreview } from "./preview";
import { normalizePosts } from "./normalize";
import { requireComponentDependancyByName } from "./dependancies";

// Our LIVE API client
const liveClient = agility.getApi({
  guid: process.env.AGILITY_CMS_GUID,
  apiKey: process.env.AGILITY_CMS_API_FETCH_KEY,
});

// Our PREVIEW API client
const previewClient = agility.getApi({
  guid: process.env.AGILITY_CMS_GUID,
  apiKey: process.env.AGILITY_CMS_API_PREVIEW_KEY,
  isPreview: true,
});

export const getClient = (preview = false) =>
  preview ? previewClient : liveClient;

// This client is used by nested components to fetch additional data within `getStaticProps`
export class APIClient {
  public preview: any;
  public client: any;

  constructor({ preview = false }) {
    this.preview = preview;
    this.client = getClient(preview);
  }

  async getAllPosts(take) {
    const data = await this.client.getContentList({
      referenceName: `posts`,
      languageCode: CMS_LANG,
      contentLinkDepth: 1,
      take: take, // TODO: Implement pagination
    });

    return data.items;
  }

  async getLatestPost() {
    const data = await this.getAllPosts(1);
    const normalizedPosts = normalizePosts(data);

    return normalizedPosts[0] || null;
  }

  async getPostDetails({ contentID, preview }) {
    const post = await this.client.getContentItem({
      contentID,
      languageCode: CMS_LANG,
      contentLinkDepth: 1,
    });
    const normalizedPost = normalizePosts([post])[0];

    return normalizedPost;
  }

  async getPostsForMoreStories({ postToExcludeContentID }) {
    let allPosts = await this.getAllPosts(5);

    //if we don't have a post to exclude, assume we should exclude the latest one
    if (postToExcludeContentID < 0) {
      allPosts.shift();
    }

    const postsLessThisPost = allPosts.filter((p) => {
      return p.contentID !== postToExcludeContentID;
    });

    const normalizedMorePosts = normalizePosts(postsLessThisPost);
    return normalizedMorePosts;
  }
}

export async function getAgilityPaths() {
  console.log(`Agility CMS => Fetching sitemap for getAgilityPaths...`);

  const sitemapFlat = await getClient().getSitemapFlat({
    channelName: CMS_CHANNEL,
    languageCode: CMS_LANG,
  });

  //returns an array of paths as a string (i.e.  ['/home', '/posts']
  //skips folders...
  const paths = Object.keys(sitemapFlat)
    .filter((s) => sitemapFlat[s].isFolder !== true)
    .map((s) => {
      return s;
    });

  return paths;
}

export async function getAgilityPageProps({ params, preview }) {
  //determine if we are in preview mode
  const client = getClient(preview);

  let path = "/";
  if (params) {
    //build path by iterating through slugs
    path = "";
    params.slug.forEach((slug) => {
      path += "/" + slug;
    });
  }

  console.log(`Agility CMS => Getting page props for '${path}'...`);

  //get sitemap
  const sitemap = await client.getSitemapFlat({
    channelName: CMS_CHANNEL,
    languageCode: CMS_LANG,
  });

  let pageInSitemap = sitemap[path];
  let page = null;

  if (path === "/") {
    let firstPagePathInSitemap = Object.keys(sitemap)[0];
    pageInSitemap = sitemap[firstPagePathInSitemap];
  }

  if (pageInSitemap) {
    //get the page
    page = await client.getPage({
      pageID: pageInSitemap.pageID,
      languageCode: CMS_LANG,
      contentLinkDepth: 1,
    });
  } else {
    //Could not find page
    console.error("page [" + path + "] not found in sitemap.");
    return;
  }

  if (!page) {
    console.error("page [" + path + "] not found in getpage method.");
    return;
  }

  //resolve the page template
  let pageTemplateName = page.templateName.replace(/[^0-9a-zA-Z]/g, "");

  //resolve the modules per content zone
  await asyncForEach(Object.keys(page.zones), async (zoneName) => {
    let modules = [];

    //grab the modules for this content zone
    const modulesForThisContentZone = page.zones[zoneName];

    //loop through the zone's modules
    await asyncForEach(modulesForThisContentZone, async (moduleItem) => {
      let ModuleComponentToRender = requireComponentDependancyByName(
        moduleItem.module,
      );

      if (ModuleComponentToRender) {
        //resolve any additional data for the modules
        let moduleData = null;

        if (ModuleComponentToRender.getCustomInitialProps) {
          //we have some additional data in the module we'll need, execute that method now, so it can be included in SSG
          console.log(
            `Agility CMS => Fetching additional data via getCustomInitialProps for ${moduleItem.module}...`,
          );
          moduleData = await ModuleComponentToRender.getCustomInitialProps({
            client: new APIClient({ preview }),
            item: moduleItem.item,
            languageCode: CMS_LANG,
            channelName: CMS_CHANNEL,
            pageInSitemap: pageInSitemap,
          });
        }

        //if we have additional module data, then overwrite our props that will be sent to the module
        if (moduleData != null) {
          moduleItem.item = moduleData;
        }

        modules.push({
          moduleName: moduleItem.module,
          item: moduleItem.item,
        });
      } else {
        console.error(
          `No react component found for the module "${moduleItem.module}". Cannot render module.`,
        );
      }
    });

    //store as dictionary
    page.zones[zoneName] = modules;
  });

  return {
    sitemapNode: pageInSitemap,
    page: page,
    pageTemplateName: pageTemplateName,
    languageCode: CMS_LANG,
    channelName: CMS_CHANNEL,
  };
}
