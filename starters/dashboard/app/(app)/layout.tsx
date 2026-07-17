import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/features/auth/auth-queries";
import {
  UserBadge,
  UserBadgeSkeleton,
} from "@/features/auth/components/user-badge";
import { UserProvider } from "@/features/auth/components/user-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const userPromise = getCurrentUser();
  return (
    <UserProvider userPromise={userPromise}>
      <header className="flex items-center justify-between py-8">
        <Link href="/" className="font-semibold">
          Dashboard
        </Link>
        <Suspense fallback={<UserBadgeSkeleton />}>
          <UserBadge />
        </Suspense>
      </header>
      <main className="flex-1 pb-16">{children}</main>
    </UserProvider>
  );
}
