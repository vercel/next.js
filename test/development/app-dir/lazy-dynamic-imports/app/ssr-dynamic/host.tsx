'use client'

import { lazy } from 'react'

const SsrTarget = lazy(() => import('./ssr-target'))
const ConcurrentTarget = lazy(() => import('./concurrent-target'))

export function Host({ target }: { target?: string }) {
  if (target === 'ssr') return <SsrTarget />
  if (target === 'concurrent') return <ConcurrentTarget />
  return <p id="ssr-idle">SSR target not rendered</p>
}
