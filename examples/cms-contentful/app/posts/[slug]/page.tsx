import { draftMode } from "next/headers";

import { getAllPosts, getPostAndMorePosts } from "@/lib/api";
import Post from "@/app/post";

export async function generateStaticParams() {
  const allPosts = await getAllPosts(false);

  return allPosts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  const { isEnabled } = draftMode();
  const { post, morePosts } = await getPostAndMorePosts(params.slug, isEnabled);

  return <Post post={post} morePosts={morePosts} />;
}
