import { getAnnouncements } from "@/features/dashboard/dashboard-queries";

export async function Announcements() {
  const announcements = await getAnnouncements();

  return (
    <ul className="mt-4 flex flex-col gap-3 rounded-lg border border-foreground/10 p-4">
      {announcements.map((announcement) => (
        <li key={announcement} className="flex items-baseline gap-2 text-sm">
          <span aria-hidden className="text-foreground/40">
            •
          </span>
          <span className="text-foreground/70">{announcement}</span>
        </li>
      ))}
    </ul>
  );
}

export function AnnouncementsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div
      aria-hidden
      className="mt-4 flex flex-col gap-3 rounded-lg border border-foreground/10 p-4"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-5 items-center">
          <div className="h-3.5 w-full max-w-sm animate-pulse rounded bg-foreground/10" />
        </div>
      ))}
    </div>
  );
}
