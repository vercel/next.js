"use client";

import { isCorsOriginError } from "next-sanity";
import { toast } from "sonner";

export function handleError(error: unknown) {
  if (isCorsOriginError(error)) {
    const { addOriginUrl } = error;
    toast.error(`Sanity Live couldn't connect`, {
      description: `Your origin is blocked by CORS policy`,
      duration: Infinity,
      action: addOriginUrl
        ? {
            label: "Manage",
            onClick: () => window.open(addOriginUrl.toString(), "_blank"),
          }
        : undefined,
    });
  } else if (error instanceof Error) {
    console.error(error);
    toast.error(error.name, { description: error.message, duration: Infinity });
  } else {
    console.error(error);
    toast.error("Unknown error", {
      description: "Check the console for more details",
      duration: Infinity,
    });
  }
}

export function onPendingHeroPostLayoutShift(resume: () => void) {
  toast("A new post is available", {
    id: "hero-layout-shift",
    duration: Infinity,
    action: {
      label: "Refresh",
      onClick: () => {
        requestAnimationFrame(() =>
          document
            .querySelector("article")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        );
        resume();
      },
    },
  });
  return () => void toast.dismiss("hero-layout-shift");
}
