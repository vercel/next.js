"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { withPageAuthRequired } from "@auth0/nextjs-auth0/client";
import type { User } from "@/interfaces";

function ProfileCard({ user }: { user: User }) {
  return (
    <>
      <h1>Profile</h1>
      <div>
        <h3>Profile (client rendered)</h3>
        <img src={user.picture} alt="user picture" />
        <p>nickname: {user.nickname}</p>
        <p>name: {user.name}</p>
      </div>
    </>
  );
}

export default withPageAuthRequired(function Profile() {
  const { user, isLoading } = useUser();

  return (
    <>{isLoading ? <>Loading...</> : user && <ProfileCard user={user} />}</>
  );
});
