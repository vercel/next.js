"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useDeferredLayoutShift } from "./use-deferred-transition";

/**
 * Suspends layout shift for the more stories section when a new post is published.
 * On changes it'll require opt-in form the user before the post is shown.
 * If the post itself is edited, it'll refresh automatically to allow fixing typos.
 */

export function MoreStoriesLayoutShift(props: {
  children: React.ReactNode;
  ids: string[];
}) {
  const [children, pending, startViewTransition] = useDeferredLayoutShift(
    props.children,
    props.ids,
  );

  /**
   * We need to suspend layout shift for user opt-in.
   */
  useEffect(() => {
    if (!pending) return;

    toast("More stories have been published", {
      id: "more-stories-layout-shift",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => startViewTransition(),
      },
    });
  }, [pending, startViewTransition]);

  return children;
}
