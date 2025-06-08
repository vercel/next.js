import type { HeroQueryResult } from "@/sanity.types";
import { dataAttribute } from "@/sanity/lib/dataAttribute";
import * as demo from "@/sanity/lib/demo";
import { sanityFetch } from "@/sanity/lib/live";
import { heroQuery, settingsQuery } from "@/sanity/lib/queries";
import { AnimatePresence } from "framer-motion";
import * as motion from "framer-motion/client";
import Link from "next/link";
import { Suspense } from "react";
import Avatar from "./avatar";
import { onPendingHeroPostLayoutShift } from "./client-functions";
import CoverImage from "./cover-image";
import DateComponent from "./date";
import { LayoutShiftSuspense } from "./layout-shift-suspense";
import MoreStories from "./more-stories";
import Onboarding from "./onboarding";
import PortableText from "./portable-text";

export default async function Page() {
  const [{ data: settings }, { data: heroPost }] = await Promise.all([
    sanityFetch({
      query: settingsQuery,
    }),
    sanityFetch({ query: heroQuery }),
  ]);

  return (
    <div className="container mx-auto px-5">
      <Intro title={settings?.title} description={settings?.description} />
      {heroPost ? (
        <LayoutShiftSuspense
          dependencies={[heroPost._id, heroPost.title]}
          onPending={onPendingHeroPostLayoutShift}
        >
          <AnimatePresence mode="popLayout">
            <motion.article
              key={heroPost._id}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="scroll-pt-5"
            >
              <HeroPost
                _id={heroPost._id}
                title={heroPost.title}
                slug={heroPost.slug}
                coverImage={heroPost.coverImage}
                excerpt={heroPost.excerpt}
                date={heroPost.date}
                author={heroPost.author}
              />
            </motion.article>
          </AnimatePresence>
          <aside>
            <motion.h2
              className="mb-8 text-6xl font-bold leading-tight tracking-tighter md:text-7xl"
              style={{ viewTransitionName: `more-stories-title` }}
              layout="position"
            >
              More Stories
            </motion.h2>
            <Suspense>
              <MoreStories skip={heroPost._id} limit={100} />
            </Suspense>
          </aside>
        </LayoutShiftSuspense>
      ) : (
        <Onboarding />
      )}
    </div>
  );
}

function Intro(props: { title: string | null | undefined; description: any }) {
  const editable = dataAttribute.combine({ type: "settings", id: "settings" });
  return (
    <section className="mb-16 mt-16 flex flex-col items-center lg:mb-12 lg:flex-row lg:justify-between">
      <motion.h1
        layout="preserve-aspect"
        // The data-sanity attribute is only needed for onboarding here, when there is no `settings` document yet
        data-sanity={
          props.title ? undefined : editable.scope("title").toString()
        }
        className="text-balance text-6xl font-bold leading-tight tracking-tighter lg:pr-8 lg:text-8xl"
        style={{ viewTransitionName: "title" }}
      >
        {props.title || demo.title}
      </motion.h1>
      <motion.h2
        layout="preserve-aspect"
        // The data-sanity attribute is only needed for onboarding here, when there is no `settings` document yet
        data-sanity={
          props.description?.length
            ? undefined
            : editable.scope("description").toString()
        }
        className="mt-5 text-pretty text-center text-lg lg:pl-8 lg:text-left"
      >
        <PortableText
          className="prose-lg"
          value={
            props.description?.length ? props.description : demo.description
          }
        />
      </motion.h2>
    </section>
  );
}

function HeroPost({
  _id,
  title,
  slug,
  excerpt,
  coverImage,
  date,
  author,
}: Pick<
  Exclude<HeroQueryResult, null>,
  "_id" | "title" | "coverImage" | "date" | "excerpt" | "author" | "slug"
>) {
  return (
    <>
      <Link
        className="group mb-8 block md:mb-16"
        href={`/posts/${slug}`}
        style={{ viewTransitionName: `post-cover-image-${_id}` }}
      >
        <CoverImage key={coverImage?.asset?._ref} image={coverImage} priority />
      </Link>
      <div className="mb-20 md:mb-28 md:grid md:grid-cols-2 md:gap-x-16 lg:gap-x-8">
        <div>
          <motion.h3
            layout="preserve-aspect"
            className="mb-4 text-pretty text-4xl leading-tight lg:text-6xl"
            style={{ viewTransitionName: `post-title-${_id}` }}
          >
            <Link href={`/posts/${slug}`} className="hover:underline">
              {title}
            </Link>
          </motion.h3>
          <motion.div
            layout="position"
            className="mb-4 text-lg md:mb-0"
            style={{ viewTransitionName: `post-date-${_id}` }}
          >
            <DateComponent dateString={date} />
          </motion.div>
        </div>
        <div>
          <motion.div
            layout="preserve-aspect"
            style={{ viewTransitionName: `post-content-${_id}` }}
          >
            {excerpt && (
              <p className="mb-4 text-pretty text-lg leading-relaxed">
                {excerpt}
              </p>
            )}
          </motion.div>
          <motion.div
            layout="position"
            style={{ viewTransitionName: `post-author-${_id}` }}
          >
            {author && <Avatar name={author.name} picture={author.picture} />}
          </motion.div>
        </div>
      </div>
    </>
  );
}
