"use client";

/**
 * This config is used to set up Sanity Studio that's mounted on the `app/(sanity)/studio/[[...tool]]/page.tsx` route
 */
import { apiVersion, dataset, projectId, studioUrl } from "@/sanity/lib/api";
import { assistWithPresets } from "@/sanity/plugins/assist";
import { pageStructure, singletonPlugin } from "@/sanity/plugins/settings";
import author from "@/sanity/schemas/documents/author";
import post from "@/sanity/schemas/documents/post";
import settings from "@/sanity/schemas/singletons/settings";
import { visionTool } from "@sanity/vision";
import { defineConfig, PluginOptions } from "sanity";
import { unsplashImageAsset } from "sanity-plugin-asset-source-unsplash";
import {
  defineDocuments,
  defineLocations,
  presentationTool,
  type DocumentLocation,
} from "sanity/presentation";
import { structureTool } from "sanity/structure";

const homeLocation = {
  title: "Home",
  href: "/",
} satisfies DocumentLocation;

export default defineConfig({
  basePath: studioUrl,
  projectId,
  dataset,
  schema: {
    types: [
      // Singletons
      settings,
      // Documents
      post,
      author,
    ],
  },
  plugins: [
    presentationTool({
      resolve: {
        mainDocuments: defineDocuments([
          {
            route: "/posts/:slug",
            filter: `_type == "post" && (slug.current == $slug || _id == $slug)`,
          },
        ]),
        locations: {
          settings: defineLocations({
            locations: [homeLocation],
            message: "This document is used on all pages",
            tone: "caution",
          }),
          post: defineLocations({
            select: {
              title: "title",
              slug: "slug.current",
            },
            resolve: (doc) => ({
              locations: [
                doc
                  ? {
                      title: doc?.title || "Untitled",
                      href: `/posts/${doc.slug}`,
                    }
                  : null,
                homeLocation,
              ].filter(Boolean) as DocumentLocation[],
            }),
          }),
        },
      },
      previewUrl: { previewMode: { enable: "/api/draft-mode/enable" } },
    }),
    structureTool({ structure: pageStructure([settings]) }),
    // Configures the global "new document" button, and document actions, to suit the Settings document singleton
    singletonPlugin([settings.name]),
    // Add an image asset source for Unsplash
    unsplashImageAsset(),
    // Sets up AI Assist with preset prompts
    // https://www.sanity.io/docs/ai-assist
    assistWithPresets(),
    // Vision lets you query your content with GROQ in the studio
    // https://www.sanity.io/docs/the-vision-plugin
    process.env.NODE_ENV === "development" &&
      visionTool({ defaultApiVersion: apiVersion }),
  ].filter(Boolean) as PluginOptions[],
});
