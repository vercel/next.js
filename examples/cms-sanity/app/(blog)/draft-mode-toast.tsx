"use client";

import {
  useDraftModeEnvironment,
  useIsPresentationTool,
} from "next-sanity/hooks";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { disableDraftMode } from "./server-functions";

export default function DraftModeToast() {
  const isPresentationTool = useIsPresentationTool();
  const env = useDraftModeEnvironment();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (isPresentationTool === false) {
      /**
       * We delay the toast in case we're inside Presentation Tool
       */
      const toastId = toast("Draft Mode Enabled", {
        id: "draft-mode-toast",
        description:
          env === "live"
            ? "Content is live, refreshing automatically"
            : "Refresh manually to see changes",
        duration: Infinity,
        action: {
          label: "Disable",
          onClick: () =>
            startTransition(async () => {
              await disableDraftMode();
              startTransition(() => router.refresh());
            }),
        },
      });
      return () => {
        toast.dismiss(toastId);
      };
    }
  }, [env, router, isPresentationTool]);

  useEffect(() => {
    if (pending) {
      const toastId = toast.loading("Disabling draft mode...");
      return () => {
        toast.dismiss(toastId);
      };
    }
  }, [pending]);

  return null;
}
