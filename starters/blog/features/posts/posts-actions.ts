"use server";

import { updateTag } from "next/cache";
import { addLike } from "./posts-queries";

export async function likePost(slug: string) {
  await addLike(slug);

  updateTag(`post:${slug}`);
  updateTag("posts");
}
