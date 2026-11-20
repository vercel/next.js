"use server";

import { Redis } from "@upstash/redis";
import { revalidatePath } from "next/cache";
import { Feature } from "./types";

const kv = Redis.fromEnv();

export async function saveFeature(formData: FormData) {
  const title = formData.get("feature");
  if (typeof title !== "string") return;

  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 150) return;

  // Build the record on the server rather than accepting it from the client.
  const feature: Feature = {
    id: crypto.randomUUID(),
    title: trimmed,
    created_at: new Date().toISOString(),
    score: "1",
  };

  await kv
    .multi()
    .hset(`item:${feature.id}`, feature)
    .zadd("items_by_score", { score: 1, member: feature.id })
    .exec();

  revalidatePath("/");
}

export async function saveEmail(formData: FormData) {
  const email = formData.get("email");

  function validateEmail(email: FormDataEntryValue) {
    const re =
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
  }

  if (email && validateEmail(email)) {
    await kv.sadd("emails", email);
    revalidatePath("/");
  }
}

export async function upvote(id: string) {
  if (typeof id !== "string") return;

  const current = await kv.zscore("items_by_score", id);
  if (current === null) return;

  await kv
    .multi()
    .hincrby(`item:${id}`, "score", 1)
    .zincrby("items_by_score", 1, id)
    .exec();

  revalidatePath("/");
}
