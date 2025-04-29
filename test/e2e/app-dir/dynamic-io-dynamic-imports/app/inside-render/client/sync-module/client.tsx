'use client'
import * as React from 'react'
import { once, oncePerRender } from '../once'

// TODO: this should always be `once`, but it's not.
//
// We need this workaround in dev, because `spawnDynamicValidationInDev` is raced with the actual render.
// The problem is that `trackDynamicImport` relies on `workUnitStore.cacheSignal`,
// but the validation render might get here first, and then we'd
//   1. invoke the import without a `cacheSignal` (because the store type is 'render')
//   2. *cache that promise forever*,
// meaning that when we get here again in the validation render,
// we won't track the promise on the cache signal (because `once` already cached the result).
//
// The workaround works by simulating `React.cache()`, i.e. creating the value once per render
// (or rather, once per workUnitStore),
// which means that we'll invoke the import again in the validation render and track it properly.
//
// The proper fix is to handle tracking `import()` that happen without a `cacheSignal` available,
// which will be done in a follow-up PR.
const onceImpl = process.env.NODE_ENV === 'development' ? oncePerRender : once
const doImport = onceImpl(() => import('./messages'))

export function Client() {
  const messages = React.use(doImport()).default
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
