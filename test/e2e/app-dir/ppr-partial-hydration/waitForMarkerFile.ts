import { setTimeout } from 'node:timers/promises'
import { access } from 'node:fs/promises'
import path from 'node:path'
import React from 'react'

export default async function waitForMarkerFile() {
  const signal = React.cacheSignal()
  if (!signal) {
    throw new Error('cacheSignal returned null, are we not rendering?')
  }
  while (true) {
    try {
      await access(path.join(process.cwd(), 'slowComponentReady'))
      return
    } catch (e) {
      await setTimeout(100, { signal })
      continue
    }
  }
}
