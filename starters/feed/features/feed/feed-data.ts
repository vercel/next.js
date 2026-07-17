import "server-only";

export type Post = {
  id: string;
  author: string;
  body: string;
  likes: number;
  createdAt: string;
};

const seed: Post[] = [
  {
    id: "12",
    author: "ada",
    body: "Shipping the new feed today.",
    likes: 4,
    createdAt: "2026-01-20T09:00:00Z",
  },
  {
    id: "11",
    author: "grace",
    body: "Pagination that stays in the static shell is underrated.",
    likes: 9,
    createdAt: "2026-01-20T08:40:00Z",
  },
  {
    id: "10",
    author: "linus",
    body: "Reminder: the shell paints first, data streams in.",
    likes: 2,
    createdAt: "2026-01-20T08:10:00Z",
  },
  {
    id: "9",
    author: "margaret",
    body: "updateTag gives you read-your-own-writes for free.",
    likes: 15,
    createdAt: "2026-01-19T22:05:00Z",
  },
  {
    id: "8",
    author: "alan",
    body: "Load more is just a link to ?page=2.",
    likes: 7,
    createdAt: "2026-01-19T19:30:00Z",
  },
  {
    id: "7",
    author: "ada",
    body: "Optimistic likes feel instant because they are.",
    likes: 3,
    createdAt: "2026-01-19T17:15:00Z",
  },
  {
    id: "6",
    author: "grace",
    body: "Each page is its own Suspense boundary.",
    likes: 6,
    createdAt: "2026-01-19T14:00:00Z",
  },
  {
    id: "5",
    author: "linus",
    body: "Seeded data means the starter runs with no setup.",
    likes: 1,
    createdAt: "2026-01-19T11:20:00Z",
  },
  {
    id: "4",
    author: "margaret",
    body: "The composer posts, then the feed refreshes by tag.",
    likes: 11,
    createdAt: "2026-01-19T09:00:00Z",
  },
  {
    id: "3",
    author: "alan",
    body: "Swap the in-memory store for a real database.",
    likes: 5,
    createdAt: "2026-01-18T20:45:00Z",
  },
  {
    id: "2",
    author: "ada",
    body: "Cache Components make this a static shell by default.",
    likes: 8,
    createdAt: "2026-01-18T18:30:00Z",
  },
  {
    id: "1",
    author: "grace",
    body: "Welcome to the feed starter.",
    likes: 20,
    createdAt: "2026-01-18T16:00:00Z",
  },
];

const globalForFeed = globalThis as unknown as { posts?: Post[] };

export const posts: Post[] = (globalForFeed.posts ??= seed);
