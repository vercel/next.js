"use client";

import { logout } from "@/features/auth/auth-actions";
import { useUser } from "./user-provider";

export function UserBadge() {
  const user = useUser();
  return (
    <form action={logout} className="flex items-center gap-3 text-sm">
      <span className="text-foreground/70">{user.name}</span>
      <button className="underline hover:text-foreground/70">Log out</button>
    </form>
  );
}

export function UserBadgeSkeleton() {
  return (
    <div aria-hidden className="flex h-5 items-center">
      <div className="h-3.5 w-24 animate-pulse rounded bg-foreground/10" />
    </div>
  );
}
