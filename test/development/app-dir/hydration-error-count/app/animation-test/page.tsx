'use client'

import { useEffect } from 'react'

/**
 * This page is to verify that the Dev Tools surface animates as expected and without jank:
 *
 * 1. When the page loads with "1 Issue" present,
 *    no animations should trigger (count change, width growth, etc.).
 *    The surface should assume its intrinsic position immediately,
 *    while still animating when collapsed from (×).
 *
 * 2. When multiple errors come in with little delay inbetween them,
 *    the count _should not_ animate when it changes because it will
 *    look janky when the `deltaMs` between changes is less than the `animationDurationMs`.
 *
 * 3. When another error comes in, and `deltaMs` is greater, the surface should
 *    subtly bounce and animate the count.
 */

// Play with this between `1` and `2`
// to make sure the surface doesn't animate the plural form (s)
const ERROR_COUNT = 2

export default function Page() {
  const clx = typeof window === 'undefined' ? 'server' : 'client'

  useEffect(() => {
    setTimeout(() => {
      throw new Error('runtime error')
    }, 2000)
  }, [])

  return <p className={clx}>{ERROR_COUNT >= 2 && <p>hey</p>}</p>
}
