"use client";

import { startTransition, useEffect } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { useDeferredLayoutShift } from "../../use-deferred-transition";

export function ContentLayoutShift(props: {
  children: React.ReactNode;
  rev: string;
}) {
  const [children, pending, startViewTransition] = useDeferredLayoutShift(
    props.children,
    [props.rev],
  );

  /**
   * We need to suspend layout shift for user opt-in.
   */
  useEffect(() => {
    if (!pending) return;

    toast("This post has been updated", {
      id: `post-content-layout-shift`,
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => {
          const update = () => startViewTransition();
          if (
            "startViewTransition" in document &&
            typeof document.startViewTransition === "function"
          ) {
            document.startViewTransition(() => flushSync(() => update()));
          } else {
            startTransition(() => update());
          }
        },
      },
    });
  }, [pending, startViewTransition]);

  return children;
}
