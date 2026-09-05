'use client'

import { lazy } from 'react'

const SsrTarget = lazy(() => import('./ssr-target'))

export function Host({ show }: { show: boolean }) {
  return show ? <SsrTarget /> : <p id="ssr-idle">SSR target not rendered</p>
}
