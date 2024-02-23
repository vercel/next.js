// Package imports
import type { Metadata } from "next";

// Utils imports
import { setSeoData } from "@/utils/seoData";

// Query imports
import { SeoQuery } from "@/queries/reusables/SeoQuery";

// Component imports
import { fetchGraphQL } from "@/utils/fetchGraphQL";
import { ContentNode, Page } from "@/gql/graphql";
import { PageQuery } from "@/components/Templates/Page/PageQuery";

// Setup metadata
export async function generateMetadata(): Promise<Metadata> {
  // fetch data
  const response = await fetchGraphQL<{ contentNode: ContentNode }>(
    SeoQuery("id"),
    { slug: 7 },
  );

  // Setup metadata
  const metadata = setSeoData({ seo: response.contentNode.seo });

  // Return metadata with canonical url
  return {
    ...metadata,
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_BASE_URL}/404-not-found/`,
    },
  } as Metadata;
}

export default async function NotFound() {
  const { page } = await fetchGraphQL<{ page: Page }>(PageQuery, {
    id: 7,
  });

  return <div dangerouslySetInnerHTML={{ __html: page.content || " " }} />;
}
