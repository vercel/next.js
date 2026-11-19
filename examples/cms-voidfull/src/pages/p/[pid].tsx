import type { GetStaticPropsContext } from "next";
import { BookOpenIcon } from "lucide-react";
import dayjs from "dayjs";
import { Interweave } from "interweave";
import { polyfill } from "interweave-ssr";
import type { Post } from "@voidfull/js-sdk";
import { cn } from "@codecarrot/essentials";

import { Client as Voidfull } from "@/lib/Voidfull";
import { hasVoidfullVariables } from "@/utils";

interface PageProps {
  post: Post;
}

export default function Page({ post }: PageProps) {
  return (
    <div className="md:py-12">
      <div
        className={cn(
          "mx-auto max-w-screen-md",
          "px-4 md:px-8 xl:px-5",
          "pb-8",
        )}
      >
        <div>
          <h1
            className={cn(
              "mb-3 mt-2",
              "text-center text-3xl font-semibold lg:text-4xl",
              "tracking-tight lg:leading-snug",
            )}
          >
            {post.title}
          </h1>

          {/* Info Bar */}
          <div
            className={cn(
              "flex justify-center",
              "border-y border-black/20 py-3 my-4 px-2 mt-6 space-x-3 text-gray-500",
            )}
          >
            <div className="flex items-center justify-center space-x-2 text-sm">
              <p className="sr-only">Published on</p>
              <time
                className="text-gray-500"
                dateTime="2022-10-21T15:48:00.000Z"
              >
                {dayjs(post.publishedAt).format("MMM DD, YYYY")}
              </time>
              {post?.timeToRead ? (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-2">
                    <BookOpenIcon className="w-4 h-4" /> {post.timeToRead} min
                    read
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <section className={cn("max-w-3xl mx-auto")}>
        {/* Featured image */}
        {post.featureImage ? (
          <figure className="">
            <img
              className="md:rounded-2xl border border-gray-200"
              srcSet={[
                post.featureImage ? `${post.featureImage} 600w` : "",
              ].toString()}
              src={post.featureImage}
              alt={post.title}
              sizes="(min-width: 1280px) 1280px"
              loading="lazy"
            />
          </figure>
        ) : null}

        {/* Post content */}
        <div
          className={cn(
            "prose lg:prose-lg !leading-6 lg:!leading-7",
            "max-w-none",
            "p-8",
          )}
        >
          <Interweave content={post.content} />
        </div>
      </section>
    </div>
  );
}

export const getStaticProps = async (
  context: GetStaticPropsContext<{
    pid: string;
  }>,
) => {
  polyfill();

  const params = context.params;
  if (!params) {
    return {
      props: {},
    };
  }

  const postSlug = params.pid;
  const postSlugArr = postSlug.split("-");
  const postId = postSlugArr[0];

  const getPostResponse = await Voidfull.sites.posts.retrieve({
    postId,
  });

  return {
    props: {
      post: getPostResponse.post,
    },
  };
};

export const getStaticPaths = async () => {
  if (!hasVoidfullVariables())
    return {
      paths: [],
      fallback: false,
    };

  try {
    const response = await Voidfull.sites.posts.list();

    return {
      paths: response.posts.map((post) => {
        return {
          params: {
            pid: `${post.id}-${post.slug}`,
          },
        };
      }),
      fallback: false,
    };
  } catch (_) {
    return {
      paths: [],
      fallback: false,
    };
  }
};
