import "server-only";

import { redirect } from "next/navigation";
import { cacheLife } from "next/cache";
import { getSession } from "./session";
import { findUserById } from "./data";

export type User = {
  id: string;
  name: string;
};

// Reads the session cookie, so it must run on every request and cannot live in
// a plain `use cache` scope. `use cache: private` lets it read the cookie while
// keeping the result out of the shared, server-stored cache. Cached scopes are
// prefetchable by default; a `stale` of at least 30 seconds keeps it that way.
export async function getCurrentUser(): Promise<User> {
  "use cache: private";
  cacheLife({ stale: 60 });

  const { userId } = await getSession();

  if (!userId) {
    redirect("/login");
  }

  const user = await findUserById(userId);

  if (!user) {
    redirect("/login");
  }

  return { id: user.id, name: user.name };
}
