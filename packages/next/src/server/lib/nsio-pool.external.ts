// The nsio (`@next/safe-image-optimization`) worker pool, shared by `next/image`
// and `ImageResponse`.
//
// Keep this outside server/image-optimizer/: standalone tracing excludes that
// directory when the hosting platform handles image optimization, but
// `ImageResponse` still needs this. It's an `.external` module so that every
// bundle shares the same pool.
//
// This also runs in image optimizer child processes, so keep its imports
// minimal. nsio itself is only required when it's used.
import type { Pool } from '@next/safe-image-optimization'

let _pool: Pool | undefined

/**
 * The pool is created on the first call, so every caller should pass the same
 * `concurrency` (`experimental.imgOptConcurrency`).
 */
export function getNsioPool(concurrency: number | null | undefined): Pool {
  if (!_pool) {
    const { Pool } =
      require('@next/safe-image-optimization') as typeof import('@next/safe-image-optimization')
    // `Pool` rejects `0`, but sharp treats it as "use the default", so match
    // that
    _pool = new Pool({ concurrency: concurrency || undefined })
  }
  return _pool
}
