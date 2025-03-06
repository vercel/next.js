import { auth } from "../lib/auth";
import { headers } from "next/headers";
import { SignInButton } from "./signin-button";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user?.email;

  return (
    <main>
      <h1>Home</h1>
        <div>{user ? <SignOut>{`Welcome ${user}`}</SignOut> : <SignInButton />}</div>
    </main>
  );
}


function SignOut({ children }: { children: React.ReactNode }) {
  return (
    <form
      action={async () => {
        "use server";
        await auth.api.signOut({
            headers: await headers(),
        });
      }}
    >
      <p>{children}</p>
      <button type="submit">Sign out</button>
    </form>
  );
}