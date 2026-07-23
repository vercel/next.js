'use client';

import { useSyncExternalStore } from 'react';

const NO_PREFETCH = 'no-prefetch';

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return document.cookie.split('; ').some(c => c === `${NO_PREFETCH}=1`);
}

// SSR can't read the cookie — assume enabled; the client corrects if it's off
function getServerSnapshot() {
  return false;
}

export function usePrefetchDefault() {
  const disabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return disabled ? null : true;
}
