import { notFound } from "next/navigation";
import Image from "next/image";

import { flotiqApiClient } from "@/flotiq-api-client";

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
    <article>
      <div
        className="flex flex-col md:flex-row items-start md:items-center
                  my-9 lg:mt-16 lg:mb-10 gap-4 md:gap-8"
      >
        {blogpost.headerImage?.length && (
          <Image
            className="h-auto w-60 m-auto"
            alt={blogpost.headerImage[0].alt || ""}
            src={flotiqApiClient.helpers.getMediaUrl(blogpost.headerImage[0])}
            width={240}
            height={240}
          />
        )}
        <div className="my-auto">
          <h1>{blogpost.title}</h1>
          <p>{blogpost.excerpt}</p>
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: blogpost.content }} />
    </article>
  );
}
