/**
 * We extend Math.random() during builds and revalidates to ensure that prerenders don't observe randomness
 * When dynamicIO is enabled. randomness is a form of IO even though it resolves synchronously. When dyanmicIO is
 * enabled we need to ensure that randomness is excluded from prerenders.
 *
 * The extensions here never error nor alter the random generation itself and thus should be transparent to callers.
 */

import { io } from './utils'

const _random = Math.random

Math.random = function random() {
  io('`Math.random()`')
  return _random.apply(null, arguments as any)

  // We bind here to alter the `toString` printing to match `Math.random`'s native `toString`.
  // eslint-disable-next-line no-extra-bind
}.bind(null)

Object.defineProperty(Math.random, 'name', { value: 'random' })
