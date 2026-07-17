import { Suspense } from "react";
import {
  Announcements,
  AnnouncementsSkeleton,
} from "@/features/dashboard/components/announcements";
import {
  RecentActivity,
  RecentActivitySkeleton,
} from "@/features/dashboard/components/recent-activity";
import {
  StatsCards,
  StatsCardsSkeleton,
} from "@/features/dashboard/components/stats-cards";

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards />
      </Suspense>
      <section className="mt-10">
        <h2 className="font-medium">Announcements</h2>
        <Suspense fallback={<AnnouncementsSkeleton />}>
          <Announcements />
        </Suspense>
      </section>
      <section className="mt-10">
        <h2 className="font-medium">Recent activity</h2>
        <Suspense fallback={<RecentActivitySkeleton />}>
          <RecentActivity />
        </Suspense>
      </section>
    </>
  );
}
