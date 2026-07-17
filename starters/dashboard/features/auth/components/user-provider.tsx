"use client";

import { createContext, use, type ReactNode } from "react";
import type { User } from "@/features/auth/auth-queries";

const UserContext = createContext<Promise<User> | null>(null);

export function UserProvider({
  userPromise,
  children,
}: {
  userPromise: Promise<User>;
  children: ReactNode;
}) {
  return (
    <UserContext.Provider value={userPromise}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const userPromise = use(UserContext);
  if (!userPromise) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return use(userPromise);
}
