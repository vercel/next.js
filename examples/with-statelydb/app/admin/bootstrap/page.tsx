"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingInterstitial } from "@/components/features/LoadingInterstitial";
import { Button } from "@/components/ui/button";

export default function BootstrapPage() {
  const router = useRouter();
  const [status, setStatus] = useState<
    "starting" | "seeding" | "redirecting" | Error
  >("starting");

  const performSeeding = useCallback(
    async (signal: AbortSignal) => {
      try {
        const response = await fetch("/admin/bootstrap/seed", {
          method: "POST",
          signal,
        });
        if (!response.ok) {
          setStatus(
            new Error(
              `Seeding failed with status ${response.status}. Please try again.`,
            ),
          );
          return;
        }
        setStatus("redirecting");
        router.replace("/");
      } catch (e) {
        if (signal.aborted) return;
        console.error(e);
        setStatus(
          new Error(
            "Network error while seeding. Please check your connection and try again.",
          ),
        );
      }
    },
    [router],
  );

  const retry = () => {
    setStatus("seeding");
    const controller = new AbortController();
    performSeeding(controller.signal);
  };

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setStatus("seeding");
      await performSeeding(controller.signal);
    })();
    return () => controller.abort();
  }, [router, performSeeding]);

  const message =
    status === "seeding"
      ? "Setting up demo data..."
      : status === "redirecting"
        ? "Redirecting to your new catalog..."
        : "Initializing...";

  return status instanceof Error ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <div className="flex flex-col items-center space-y-6 px-4 max-w-md">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Seeding Failed</h2>
          <p className="text-muted-foreground">{status.message}</p>
        </div>
        <Button onClick={retry} className="w-full">
          Retry
        </Button>
      </div>
    </div>
  ) : (
    <LoadingInterstitial message={message} />
  );
}
