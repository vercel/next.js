import crypto from "crypto";
import { getClient } from "./api";
import { CMS_LANG, CMS_CHANNEL } from "./constants";

//Generates a preview key to compare against
export function generatePreviewKey() {
  //the string we want to encode
  const str = `-1_${process.env.AGILITY_CMS_SECURITY_KEY}_Preview`;

  //build our byte array
  let data = [];
  for (var i = 0; i < str.length; ++i) {
    data.push(str.charCodeAt(i));
    data.push(0);
  }

  //convert byte array to buffer
  const strBuffer = Buffer.from(data);
  //encode it!
  const previewKey = crypto
    .createHash("sha512")
    .update(strBuffer)
    .digest("base64");

  return previewKey;
}

//Checks that the requested page exists, if not return a 401
export async function validateSlugForPreview({ slug, contentID }) {
  //if its for root, allow it and kick out
  if (slug === `/`) {
    return {
      error: false,
      message: null,
      slug: `/`,
    };
  }

  const client = getClient(true);
  //this is a standard page
  const sitemapFlat = await client.getSitemapFlat({
    channelName: CMS_CHANNEL,
    languageCode: CMS_LANG,
  });

  let sitemapNode = null;

  if (!contentID) {
    //For standard pages
    sitemapNode = sitemapFlat[slug];
  } else {
    console.log(contentID);
    //For dynamic pages - need to adjust the actual slug
    slug = Object.keys(sitemapFlat).find((key) => {
      const node = sitemapFlat[key];
      if (node.contentID === contentID) {
        return node;
      }
      return false;
    });

    sitemapNode = sitemapFlat[slug];
  }

  if (!sitemapNode) {
    return {
      error: true,
      message: `Invalid page. '${slug}' was not found in the sitemap. Are you trying to preview a Dynamic Page Item? If so, ensure you have your List Preview Page, Item Preview Page, and Item Preview Query String Parameter set (contentid) .`,
      slug: null,
    };
  }

  return {
    error: false,
    message: null,
    slug: sitemapNode.path,
  };
}

//Validates whether the incoming preview request is valid
export async function validatePreview({ agilityPreviewKey, slug, contentID }) {
  //Validate the preview key
  if (!agilityPreviewKey) {
    return {
      error: true,
      message: `Missing agilitypreviewkey.`,
    };
  }

  //sanitize incoming key (replace spaces with '+')
  if (agilityPreviewKey.includes(` `)) {
    agilityPreviewKey = agilityPreviewKey.split(` `).join(`+`);
  }

  //compare the preview key being used
  const correctPreviewKey = generatePreviewKey();

  if (agilityPreviewKey !== correctPreviewKey) {
    return {
      error: true,
      message: `Invalid agilitypreviewkey.`,
      //message: `Invalid agilitypreviewkey. Incoming key is=${agilityPreviewKey} compared to=${correctPreviewKey}...`
    };
  }

  const validateSlugResponse = await validateSlugForPreview({
    slug,
    contentID,
  });

  if (validateSlugResponse.error) {
    //kickout
    return validateSlugResponse;
  }

  //return success
  return {
    error: false,
    message: null,
    slug: validateSlugResponse.slug,
  };
}
