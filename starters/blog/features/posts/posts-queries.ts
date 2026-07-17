import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  publishedAt: string;
  likes: number;
};

const posts: Post[] = [
  {
    slug: "hello-world",
    title: "Hello world",
    excerpt: "The first post on this blog.",
    content:
      "Welcome to the blog. This post is served from the in-memory store in features/posts/posts-queries.ts. Replace the store with your database or CMS and keep the cached query functions as your data layer.",
    publishedAt: "2026-01-05",
    likes: 12,
  },
  {
    slug: "caching-by-default",
    title: "Caching by default",
    excerpt: "How the cached data layer works.",
    content:
      "Reads in this app are cached queries tagged with cacheTag and given a lifetime with cacheLife. Pages become static shells that revalidate in the background, and mutations call updateTag to show changes immediately.",
    publishedAt: "2026-01-12",
    likes: 8,
  },
  {
    slug: "streaming-the-rest",
    title: "Streaming the rest",
    excerpt: "Suspense boundaries around every async read.",
    content:
      "Anything that cannot be prerendered streams in behind a Suspense boundary with a skeleton that reserves its space. The static shell paints first; the data fills in without layout shift.",
    publishedAt: "2026-01-19",
    likes: 21,
  },
];

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export async function getPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts");

  await delay();
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function getPost(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts", `post:${slug}`);

  await delay();
  const post = posts.find((p) => p.slug === slug);
  if (!post) {
    notFound();
  }
  return post;
}

export async function addLike(slug: string) {
  const post = posts.find((p) => p.slug === slug);
  if (post) {
    post.likes += 1;
  }
}
