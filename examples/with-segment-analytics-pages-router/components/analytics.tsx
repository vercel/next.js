import { useEffect } from "react";
import { useRouter } from "next/router";
import { analytics } from "@/lib/segment";

export default function Analytics() {
  const router = useRouter();

  useEffect(() => {
    analytics.page();

    router.events.on("routeChangeComplete", () => analytics.page());

    return () => {
      router.events.off("routeChangeComplete", () => analytics.page());
    };
  }, [router.events]);

  return null;
}
