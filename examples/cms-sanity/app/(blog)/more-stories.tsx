import { sanityFetch } from "@/sanity/lib/live";
import { moreStoriesQuery } from "@/sanity/lib/queries";
import { AnimatePresence } from "framer-motion";
import * as motion from "framer-motion/client";
import Link from "next/link";
import Avatar from "./avatar";
import CoverImage from "./cover-image";
import DateComponent from "./date";
import { MoreStoriesLayoutShift } from "./more-stories-layout-shift";

export default async function MoreStories(params: {
  skip: string;
  limit: number;
}) {
  const { data } = await sanityFetch({ query: moreStoriesQuery, params });

  return (
    <div className="mb-32 grid grid-cols-1 gap-y-20 md:grid-cols-2 md:gap-x-16 md:gap-y-32 lg:gap-x-32">
      <MoreStoriesLayoutShift
        key={params.skip}
        ids={data?.map((post) => post._id) ?? []}
      >
        <AnimatePresence mode="popLayout">
          {data?.map((post) => {
            const { _id, title, slug, coverImage, excerpt, author } = post;
            return (
              <motion.article
                key={_id}
                layout="position"
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Link
                  href={`/posts/${slug}`}
                  className="group mb-5 block"
                  style={{ viewTransitionName: `post-cover-image-${_id}` }}
                >
                  <CoverImage image={coverImage} priority={false} />
                </Link>
                <motion.h3
                  layout="preserve-aspect"
                  className="mb-3 text-balance text-3xl leading-snug"
                  style={{ viewTransitionName: `post-title-${_id}` }}
                >
                  <Link href={`/posts/${slug}`} className="hover:underline">
                    {title}
                  </Link>
                </motion.h3>
                <motion.div
                  layout
                  className="mb-4 text-lg"
                  style={{ viewTransitionName: `post-date-${_id}` }}
                >
                  <DateComponent dateString={post.date} />
                </motion.div>
                <motion.div
                  layout="preserve-aspect"
                  style={{ viewTransitionName: `post-excerpt-${_id}` }}
                >
                  {excerpt && (
                    <p className="mb-4 text-pretty text-lg leading-relaxed">
                      {excerpt}
                    </p>
                  )}
                </motion.div>
                <motion.div
                  layout
                  style={{ viewTransitionName: `post-author-${_id}` }}
                >
                  {author && (
                    <Avatar name={author.name} picture={author.picture} />
                  )}
                </motion.div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </MoreStoriesLayoutShift>
    </div>
  );
}
