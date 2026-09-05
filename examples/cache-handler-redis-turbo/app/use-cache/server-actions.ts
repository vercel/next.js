"use server";

import { revalidateTag } from "next/cache";

export default async function revalidateUseCache() {
  // Invalidates the "use-cache-fact" tag across all server instances
  // sharing the Redis cache.
  revalidateTag("use-cache-fact", "max");
}
