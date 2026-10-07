import type { ListPostResponse } from "@voidfull/js-sdk";
import { cn } from "@codecarrot/essentials";

import { hasVoidfullVariables } from "@/utils";
import { Client as Voidfull } from "@/lib/Voidfull";

import { Root as VoidfullWelcome } from "@/components/Voidfull/Root";
import { PostCardImage } from "@/components/Post/PostCardImage";
import { PostCardContent } from "@/components/Post/PostCardContent";

interface PageProps {
  data: ListPostResponse["posts"];
}

export default function Home({ data }: PageProps) {
  return (
    <main className="mx-auto max-w-screen-lg px-4">
      <section className="my-12">
        <VoidfullWelcome />
      </section>

      {data?.length > 0 ? (
        <div className="grid gap-10 md:grid-cols-2">
          {data
            .filter((item) => item.publishedAt !== null)
            .map((post) => (
              <article className={cn("grid gap-4", "group")}>
                {post.featureImage ? (
                  <PostCardImage
                    id={post.id}
                    title={post.title}
                    slug={post.slug}
                    featureImage={post.featureImage}
                  />
                ) : null}

                <PostCardContent
                  id={post.id}
                  title={post.title}
                  slug={post.slug}
                  excerpt={post.excerpt}
                  publishedAt={post.publishedAt}
                />
              </article>
            ))}
        </div>
      ) : (
        <p className={cn("text-sm text-center")}>No posts</p>
      )}
    </main>
  );
}

export const getStaticProps = async () => {
  if (!hasVoidfullVariables())
    return {
      props: {
        data: [],
      },
    };

  try {
    const response = await Voidfull.sites.posts.list();

    return {
      props: {
        data: response.posts,
      },
    };
  } catch (_) {
    return {
      props: {
        data: [],
      },
    };
  }
};
