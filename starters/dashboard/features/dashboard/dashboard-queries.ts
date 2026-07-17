import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getCurrentUser } from "@/features/auth/auth-queries";

export type Stat = {
  label: string;
  value: string;
};

export type Activity = {
  id: number;
  description: string;
  at: string;
};

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export async function getStats() {
  await getCurrentUser();

  await delay();
  return [
    { label: "Projects", value: "12" },
    { label: "Deployments", value: "38" },
    { label: "Uptime", value: "99.98%" },
  ];
}

export async function getRecentActivity() {
  const user = await getCurrentUser();

  await delay();
  return [
    { id: 1, description: `${user.name} deployed web`, at: "2h ago" },
    { id: 2, description: "Build completed for docs", at: "5h ago" },
    { id: 3, description: "Domain verified", at: "1d ago" },
  ];
}

export async function getAnnouncements() {
  "use cache";
  cacheLife("hours");
  cacheTag("announcements");

  await delay();
  return [
    "Scheduled maintenance on Saturday.",
    "New analytics dashboard is in beta.",
  ];
}
