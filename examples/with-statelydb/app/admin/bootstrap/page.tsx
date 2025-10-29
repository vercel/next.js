"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingInterstitial } from "@/components/features/LoadingInterstitial";

export default function BootstrapPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"starting" | "seeding" | "redirecting">("starting");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("seeding");
      try {
        await fetch("/admin/bootstrap/seed", { method: "POST" });
      } catch (e) {
        // swallow - user can refresh
      } finally {
        if (!cancelled) {
          setStatus("redirecting");
          router.replace("/");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const message =
    status === "seeding"
      ? "Setting up demo data..."
      : status === "redirecting"
      ? "Redirecting to your new catalog..."
      : "Initializing...";

  return <LoadingInterstitial message={message} />;
}

