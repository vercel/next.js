'use client'

import { useDeferredValue, type ReactNode } from 'react'

export default function DeferredLayout({ children }: { children: ReactNode }) {
  // Render the page in a deferred lane, where useDeferredValue may skip its
  // initial value. A paused navigation must still select the prefetched shell.
  return useDeferredValue(children, null)
}
