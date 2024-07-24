"use client";

import Link from "next/link";
import {
  useContentfulInspectorMode,
  useContentfulLiveUpdates,
} from "@contentful/live-preview/react";

import MoreStories from "./more-stories";
import Avatar from "./avatar";
import Date from "./date";
import CoverImage from "./cover-image";

import { Markdown } from "@/lib/markdown";

export default function Post({
  post,
  morePosts,
}: {
  post: any;
  morePosts: any;
}) {
  const updatedPost = useContentfulLiveUpdates(post);
  const inspectorProps = useContentfulInspectorMode({ entryId: post.sys.id });

  return (
    <div className="container mx-auto px-5">
      <h2 className="mb-20 mt-8 text-2xl font-bold leading-tight tracking-tight md:text-4xl md:tracking-tighter">
        <Link href="/" className="hover:underline">
          Blog
        </Link>
        .
      </h2>
      <article>
        <h1
          {...inspectorProps({ fieldId: "title" })}
          className="mb-12 text-center text-6xl font-bold leading-tight tracking-tighter md:text-left md:text-7xl md:leading-none lg:text-8xl"
        >
          {updatedPost.title}
        </h1>
        <div className="hidden md:mb-12 md:block">
          {updatedPost.author && (
            <Avatar
              id={updatedPost.author.sys.id}
              name={updatedPost.author.name}
              picture={updatedPost.author.picture}
            />
          )}
        </div>
        <div className="mb-8 sm:mx-0 md:mb-16">
          <CoverImage
            id={updatedPost.coverImage.sys.id}
            title={updatedPost.title}
            url={updatedPost.coverImage.url}
          />
        </div>
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 block md:hidden">
            {updatedPost.author && (
              <Avatar
                id={updatedPost.author.sys.id}
                name={updatedPost.author.name}
                picture={updatedPost.author.picture}
              />
            )}
          </div>
          <div
            {...inspectorProps({ fieldId: "date" })}
            className="mb-6 text-lg"
          >
            <Date dateString={updatedPost.date} />
          </div>
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="prose" {...inspectorProps({ fieldId: "content" })}>
            <Markdown content={updatedPost.content} />
          </div>
        </div>
      </article>
      <hr className="border-accent-2 mt-28 mb-24" />
      <MoreStories morePosts={morePosts} />
    </div>
  );
}
