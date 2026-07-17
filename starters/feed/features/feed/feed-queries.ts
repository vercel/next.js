import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { posts } from "./feed-data";

export const PAGE_SIZE = 5;

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export async function getFeed(page = 1) {
  "use cache";
  cacheLife("hours");
  cacheTag("feed");

  await delay();
  const start = (page - 1) * PAGE_SIZE;
  const slice = posts.slice(start, start + PAGE_SIZE + 1);
  const hasMore = slice.length > PAGE_SIZE;
  return { posts: slice.slice(0, PAGE_SIZE), hasMore };
}

export async function getPost(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("feed", `post:${id}`);

  await delay();
  const post = posts.find((p) => p.id === id);
  if (!post) {
    notFound();
  }
  return post;
}
