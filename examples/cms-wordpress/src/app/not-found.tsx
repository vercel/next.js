// Package imports
import type { Metadata } from "next";
import { print } from "graphql/language/printer";

// Utils imports
import { setSeoData } from "@/utils/seoData";

// Query imports

// Component imports
import { fetchGraphQL } from "@/utils/fetchGraphQL";
import { ContentNode, Page } from "@/gql/graphql";
import { PageQuery } from "@/components/Templates/Page/PageQuery";
import { SeoQuery } from "@/queries/general/SeoQuery";

// adjust the id to the 404 page id in WordPress
const notFoundId = 7;

// Setup metadata
export async function generateMetadata(): Promise<Metadata> {
  // fetch data
  const { contentNode } = await fetchGraphQL<{ contentNode: ContentNode }>(
    print(SeoQuery),
    { slug: notFoundId, idType: "DATABASE_ID" },
  );

  // Setup metadata
  const metadata = setSeoData({ seo: contentNode.seo });

  // Return metadata with canonical url
  return {
    ...metadata,
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_BASE_URL}/404-not-found/`,
    },
  } as Metadata;
}

export default async function NotFound() {
  const { page } = await fetchGraphQL<{ page: Page }>(print(PageQuery), {
    id: notFoundId,
  });

  return <div dangerouslySetInnerHTML={{ __html: page.content || " " }} />;
}
