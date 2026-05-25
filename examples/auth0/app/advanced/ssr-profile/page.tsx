import { getSession } from "@auth0/nextjs-auth0";
import { redirect } from "next/navigation";
import type { User } from "@/interfaces";

export default async function SSRProfile() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  const user = session.user as User;

  return (
    <>
      <h1>Profile</h1>
      <div>
        <h3>Profile (server rendered)</h3>
        <img src={user.picture} alt="user picture" />
        <p>nickname: {user.nickname}</p>
        <p>name: {user.name}</p>
      </div>
    </>
  );
}
