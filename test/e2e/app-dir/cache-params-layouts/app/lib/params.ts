import { cache } from 'react'

type Params = Record<string, string | string[]>

const getSegmentParams = cache((): { current: Promise<Params> | null } => {
  return { current: null }
})

/**
 * Call this in your layout/page to "provide" params to the subtree.
 * Pass the params prop directly — do not await it first.
 */
export function provideParams(params: Promise<Params>) {
  getSegmentParams().current = params
}

/**
 * Call this anywhere in the component tree below a layout/page
 * that called provideParams(). Works like cookies() or headers().
 */
export function params(): Promise<Params> {
  const store = getSegmentParams()
  if (!store.current) {
    throw new Error(
      'params() was called but no layout or page has provided params yet. ' +
        'Make sure a parent layout calls provideParams(params).'
    )
  }
  return store.current
}
