import { dataAttribute } from "@/sanity/lib/dataAttribute";
import * as demo from "@/sanity/lib/demo";
import { sanityFetch } from "@/sanity/lib/live";
import { postQuery, settingsQuery } from "@/sanity/lib/queries";
import { resolveOpenGraphImage } from "@/sanity/lib/utils";
import * as motion from "framer-motion/client";
import type { Metadata, ResolvingMetadata } from "next";
import { defineQuery, type PortableTextBlock } from "next-sanity";
import Link from "next/link";
import { Suspense } from "react";
import Avatar from "../../avatar";
import CoverImage from "../../cover-image";
import DateComponent from "../../date";
import MoreStories from "../../more-stories";
import { OptimisticPortableText } from "../../optimistic-portable-text";
import PortableText from "../../portable-text";
import { ContentLayoutShift } from "./content-layout-shift";

type Props = {
  params: Promise<{ slug: string }>;
};

const postSlugs = defineQuery(
  `*[_type == "post" && defined(slug.current)]{"slug": slug.current}`,
);

export async function generateStaticParams() {
  const { data } = await sanityFetch({
    query: postSlugs,
    perspective: "published",
    stega: false,
  });
  return data;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { data: post } = await sanityFetch({
    query: postQuery,
    params,
    stega: false,
  });
  const previousImages = (await parent).openGraph?.images || [];
  const ogImage = resolveOpenGraphImage(post?.coverImage);

  return {
    authors: post?.author?.name ? [{ name: post?.author?.name }] : [],
    title: post?.title,
    description: post?.excerpt,
    openGraph: {
      images: ogImage ? [ogImage, ...previousImages] : previousImages,
    },
  } satisfies Metadata;
}

export default async function PostPage({ params }: Props) {
  const [{ data: post }, { data: settings }] = await Promise.all([
    sanityFetch({ query: postQuery, params }),
    sanityFetch({ query: settingsQuery }),
  ]);

  return (
    <div className="container mx-auto px-5">
      <motion.h2
        layout="preserve-aspect"
        className="mb-16 mt-10 w-fit text-2xl font-bold leading-tight tracking-tight md:text-4xl md:tracking-tighter"
      >
        <Link
          href="/"
          className="hover:underline"
          style={{ viewTransitionName: "title" }}
        >
          {settings?.title || demo.title}
        </Link>
      </motion.h2>
      {post?._id ? (
        <article>
          <motion.h1
            layout="preserve-aspect"
            className="mb-12 text-balance text-6xl font-bold leading-tight tracking-tighter md:text-7xl md:leading-none lg:text-8xl"
            style={{ viewTransitionName: `post-title-${post._id}` }}
          >
            {post.title}
          </motion.h1>
          <motion.div
            layout="position"
            className="hidden md:mb-12 md:block"
            style={{ viewTransitionName: `post-author-${post._id}` }}
          >
            {post.author && (
              <Avatar name={post.author.name} picture={post.author.picture} />
            )}
          </motion.div>
          <div
            className="mb-8 sm:mx-0 md:mb-16"
            style={{ viewTransitionName: `post-cover-image-${post._id}` }}
          >
            <CoverImage image={post.coverImage} priority />
          </div>
          <div className="mx-auto max-w-2xl">
            <motion.div
              layout="position"
              className="mb-6 block md:hidden"
              style={{ viewTransitionName: `post-author-${post._id}` }}
            >
              {post.author && (
                <Avatar name={post.author.name} picture={post.author.picture} />
              )}
            </motion.div>
            <div className="mb-6 text-lg">
              <motion.div
                layout="position"
                className="mb-4 text-lg"
                style={{ viewTransitionName: `post-date-${post._id}` }}
              >
                <DateComponent dateString={post.date} />
              </motion.div>
            </div>
          </div>
          <div style={{ viewTransitionName: `post-content-${post._id}` }}>
            {post.content?.length && (
              <PortableText
                className="mx-auto max-w-2xl"
                csm={{
                  id: post._id,
                  type: "post",
                  path: "content",
                }}
                value={post.content as PortableTextBlock[]}
              />
            )}
          </div>
        </article>
      ) : (
        <h1 className="mb-12 text-balance text-6xl font-bold leading-tight tracking-tighter md:text-7xl md:leading-none lg:text-8xl">
          404 - Post Not Found
        </h1>
      )}
      <aside>
        <hr className="border-accent-2 mb-24 mt-28" />
        <motion.h2
          className="mb-8 text-6xl font-bold leading-tight tracking-tighter md:text-7xl"
          style={{ viewTransitionName: `more-stories-title` }}
          layout="position"
        >
          Recent Stories
        </motion.h2>
        <Suspense>
          <MoreStories skip={post?._id || (await params).slug} limit={2} />
        </Suspense>
      </aside>
    </div>
  );
}
