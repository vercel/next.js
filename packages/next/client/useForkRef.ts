import React from 'react'

// Note: Credit of this hook goes to material-ui
// Source: https://github.com/mui-org/material-ui/blob/master/packages/material-ui/src/utils/useForkRef.js

function setRef<T>(ref: React.Ref<T> | ((instance: T | null) => void) | null | undefined, value:  T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    /**
     * need to type cast to enforce that we
     * know it's valid here to mutate ref.current
     *
     * @see https://github.com/DefinitelyTyped/DefinitelyTyped/issues/31065#issuecomment-596081842
     */
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

/**
 * A hook that can combine two refs(mutable or callbackRefs) into a single callbackRef
 */
export function useForkRef<T>(refA: React.Ref<T>, refB: React.Ref<T>): React.Ref<T> {
  /**
   * This will create a new function if the ref props change and are defined.
   * This means react will call the old forkRef with `null` and the new forkRef
   * with the ref. Cleanup naturally emerges from this behavior
   */
  return React.useMemo(() => {
    if (refA == null && refB == null) {
      return null;
    }
    return (refValue) => {
      setRef(refA, refValue);
      setRef(refB, refValue);
    };
  }, [refA, refB]);
}