import "server-only";
import { cacheLife } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type User = {
  name: string;
};

export async function getCurrentUser() {
  "use cache: private";
  cacheLife({ stale: 60 });

  const username = (await cookies()).get("session")?.value;
  if (!username) {
    redirect("/login");
  }
  return { name: username };
}
