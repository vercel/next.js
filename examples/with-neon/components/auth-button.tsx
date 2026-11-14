import Link from "next/link";
import { connection } from "next/server";
import { Button } from "./ui/button";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  // Imported here so the starter still renders its setup steps before the
  // Neon Auth environment variables are set.
  const { auth } = await import("@/lib/auth/server");

  // The session depends on the request's cookies, so render at request time.
  await connection();

  // Reads the signed session cookie, so most calls don't reach Neon Auth.
  const { data } = await auth.getSession();

  const user = data?.user;

  return user ? (
    <div className="flex items-center gap-4">
      Hey, {user.email}!
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/auth/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
}
