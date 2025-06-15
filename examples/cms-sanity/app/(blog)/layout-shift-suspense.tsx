"use client";

import { useIsLivePreview } from "next-sanity/hooks";
import { useEffect } from "react";
import { useDeferredLayoutShift } from "./use-deferred-transition";

type PendingCallback = (resume: () => void) => void | (() => void);

function DeferLayoutShift(props: {
  children: React.ReactNode;
  dependencies: unknown[];
  onPending: PendingCallback;
}) {
  const { dependencies, onPending } = props;
  const [children, pending, startViewTransition] = useDeferredLayoutShift(
    props.children,
    dependencies,
  );

  /**
   * We need to suspend layout shift for user opt-in.
   */
  useEffect(() => {
    if (!pending) return;

    return onPending(startViewTransition);
  }, [pending, startViewTransition, onPending]);

  return children;
}

export function LayoutShiftSuspense(props: {
  children: React.ReactNode;
  dependencies: unknown[];
  onPending: PendingCallback;
}) {
  const { children, dependencies, onPending } = props;
  /**
   * If we are in live preview mode then we can skip suspending layout shift.
   * The `useIsLivePreview` hook returns `null` until it has fully verified what environment is in,
   * since visitors are far more likely to be in production we assume that they're not in live preview, until definitively proven otherwise.
   */
  const isLivePreview = useIsLivePreview() === true;
  if (isLivePreview) {
    return children;
  }

  return (
    <DeferLayoutShift dependencies={dependencies} onPending={onPending}>
      {children}
    </DeferLayoutShift>
  );
}
