"use server";

import { updateTag } from "next/cache";
import { posts } from "./feed-data";

export type PostState = { error: string } | null;

export async function createPost(
  _prevState: PostState,
  formData: FormData,
): Promise<PostState> {
  const body = formData.get("body");
  if (typeof body !== "string" || body.trim() === "") {
    return { error: "Say something." };
  }

  posts.unshift({
    id: crypto.randomUUID(),
    author: "you",
    body: body.trim(),
    likes: 0,
    createdAt: new Date().toISOString(),
  });

  updateTag("feed");
  return null;
}

export async function likePost(id: string) {
  const post = posts.find((p) => p.id === id);
  if (post) {
    post.likes += 1;
  }

  updateTag("feed");
}
