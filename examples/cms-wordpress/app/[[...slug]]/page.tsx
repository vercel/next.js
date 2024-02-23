// Package imports
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// Utils imports
import { setSeoData } from "@/utils/seoData";

// Query imports
import { SeoQuery } from "@/queries/reusables/SeoQuery";
import { fetchGraphQL } from "@/utils/fetchGraphQL";
import { ContentInfoQuery } from "@/queries/general/ContentInfoQuery";
import { ContentNode } from "@/gql/graphql";
import PageTemplate from "@/components/Templates/Page/PageTemplate";
import { nextSlugToWpSlug } from "@/utils/nextSlugToWpSlug";
import PostTemplate from "@/components/Templates/Post/PostTemplate";

// Type definition
type Props = {
  params: { slug: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = nextSlugToWpSlug(params.slug);
  const isPreview = slug.includes("preview");

  const { contentNode } = await fetchGraphQL<{ contentNode: ContentNode }>(
    SeoQuery(isPreview ? "id" : "slug"),
    {
      slug: isPreview ? slug.split("preview/")[1] : slug,
    },
  );

  // If seo is null, trigger the 404
  if (!contentNode) {
    return notFound();
  }

  // Setup metadata
  const metadata = setSeoData({ seo: contentNode.seo });

  // Return metadata with canonical url
  return {
    ...metadata,
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_BASE_URL}${slug}`,
    },
  } as Metadata;
}

export default async function Page({ params }: Props) {
  const slug = nextSlugToWpSlug(params.slug);
  const isPreview = slug.includes("preview");
  const { contentNode } = await fetchGraphQL<{ contentNode: ContentNode }>(
    ContentInfoQuery(isPreview ? "id" : "slug"),
    {
      slug: isPreview ? slug.split("preview/")[1] : slug,
    },
  );

  if (!contentNode) return notFound();

  switch (contentNode.contentTypeName) {
    case "page":
      return <PageTemplate node={contentNode} />;
    case "post":
      return <PostTemplate node={contentNode} />;
    default:
      return <p>{contentNode.contentTypeName} not implemented</p>;
  }
}
