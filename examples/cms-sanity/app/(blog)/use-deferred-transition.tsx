import { useIsLivePreview } from "next-sanity/hooks";
import { useCallback, useState } from "react";
import isEqual from "react-fast-compare";

export function useDeferredLayoutShift(
  children: React.ReactNode,
  dependencies: unknown[],
) {
  const [pending, setPending] = useState(false);
  const [currentChildren, setCurrentChildren] = useState(children);
  const [currentDependencies, setCurrentDependencies] = useState(dependencies);

  if (!pending) {
    if (isEqual(currentDependencies, dependencies)) {
      if (currentChildren !== children) {
        setCurrentChildren(children);
      }
    } else {
      setCurrentDependencies(dependencies);
      setPending(true);
    }
  }

  const startViewTransition = useCallback(() => {
    setCurrentDependencies(dependencies);
    setPending(false);
  }, [dependencies]);

  /**
   * If we are in live preview mode then we can skip suspending layout shift.
   * @TODO shift this to another boundary
   */
  const isLivePreview = useIsLivePreview() === true;

  return [
    pending && !isLivePreview ? currentChildren : children,
    pending && !isLivePreview,
    startViewTransition,
  ] as const;
}
