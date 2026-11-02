'use client'

import { sharedValue } from './shared-module'

export function Content() {
  return <p id="content">{sharedValue('page')}</p>
}
