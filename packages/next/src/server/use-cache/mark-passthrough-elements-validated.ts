import { isValidElement } from 'react'

const MAX_DEPTH = 10

interface DevElement {
  readonly props: unknown
  readonly _store?: { validated?: number }
}

/**
 * Marks React elements passed into a `"use cache"` function as already
 * key-validated, before they're encoded as temporary references.
 *
 * Such an element comes back out of the cached stream as the very same object,
 * but it has skipped the dev JSX runtime's static-children validation on the
 * way: inside the cache the prop is an opaque proxy, not an element, so `jsxs`
 * has nothing to mark. Rendering two slots side by side then produces a bogus
 * "Each child in a list should have a unique key prop" warning.
 * See https://github.com/vercel/next.js/issues/97047.
 *
 * Elements sitting directly inside an array are left alone, so a genuinely
 * unkeyed list handed to a cached component still warns.
 */
export function markPassthroughElementsValidated(args: unknown[]): void {
  // This only sharpens a dev warning, so a hostile getter or proxy buried in
  // the args must never take the render down with it.
  try {
    const seen = new WeakSet<object>()

    for (const arg of args) {
      visit(arg, false, seen, 0)
    }
  } catch {}
}

function visit(
  value: unknown,
  insideArray: boolean,
  seen: WeakSet<object>,
  depth: number
): void {
  // Temporary references from an enclosing cache scope are function proxies
  // that throw on any unrecognized property, so the typeof check has to come
  // before anything touches `value`.
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return
  }

  if (seen.has(value)) {
    return
  }

  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, true, seen, depth + 1)
    }

    return
  }

  if (isValidElement(value)) {
    const { props, _store } = value as unknown as DevElement

    if (!insideArray && _store && !_store.validated) {
      _store.validated = 1
    }

    visit(props, false, seen, depth + 1)

    return
  }

  const prototype = Object.getPrototypeOf(value)

  if (prototype !== Object.prototype && prototype !== null) {
    return
  }

  for (const key of Object.keys(value)) {
    // Read through the descriptor to avoid invoking getters, which are the
    // serializer's business, not ours.
    const descriptor = Object.getOwnPropertyDescriptor(value, key)

    if (descriptor && 'value' in descriptor) {
      visit(descriptor.value, false, seen, depth + 1)
    }
  }
}
