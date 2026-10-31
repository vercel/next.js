"use client";

import { useUser } from "./user-provider";

export function UserBadge() {
  const user = useUser();
  return <span>Signed in as {user.name}</span>;
}
