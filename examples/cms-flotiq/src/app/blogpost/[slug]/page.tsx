import { notFound } from "next/navigation";

import { flotiqApiClient } from "@/flotiq-api-client";

import PageSummary from "@/app/_components/PageSummary/PageSummary";

export default async function PostPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;

  const content = await flotiqApiClient.content.blogpost.list({
    limit: 1,
    hydrate: 1,
    filters: { slug: { type: "equals", filter: slug } },
  });

  if (!content?.data?.[0]) {
    return notFound();
  }

  const blogpost = content.data[0];

  return (
    <article className="space-y-10">
      <PageSummary
        title={blogpost.title}
        description={blogpost.excerpt}
        {...(blogpost.headerImage?.length
          ? {
              imageUrl: flotiqApiClient.helpers.getMediaUrl(
                blogpost.headerImage[0],
              ),
              imageAlt: blogpost.headerImage[0].alt,
            }
          : {})}
      />

      <div dangerouslySetInnerHTML={{ __html: blogpost.content }} />
    </article>
  );
}
