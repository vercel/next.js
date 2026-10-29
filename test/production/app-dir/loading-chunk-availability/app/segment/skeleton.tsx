'use client'

import { sharedValue } from './shared-module'

export function Skeleton() {
  return <p id="skeleton">{sharedValue('loading')}</p>
}
