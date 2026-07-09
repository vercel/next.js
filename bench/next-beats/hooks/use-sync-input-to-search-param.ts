'use client';

import { useLayoutEffect, type RefObject } from 'react';

export function useSyncInputToSearchParam(ref: RefObject<HTMLInputElement | null>, param: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = new URLSearchParams(window.location.search).get(param) ?? '';
  }, [ref, param]);
}
