// Renders `ImageResponse`s with nsio (`@next/safe-image-optimization`) instead
// of sharp or resvg-wasm, enabled by
// `experimental.imgOptSafeMode.imageResponse`.
//
// This is an `.external` module so that it's never bundled: both nsio and the
// Node.js build of `@vercel/og` must be loaded from `next`'s own dependencies.
import type { SharpLike } from 'next/dist/compiled/@vercel/og/index.node.js'
import { getNsioPool } from '../lib/nsio-pool.external'

type OgModule = typeof import('next/dist/compiled/@vercel/og/index.node.js')
type ImageResponseArgs = ConstructorParameters<OgModule['ImageResponse']>

/** Passed from `next.config.js` with `process.env.__NEXT_IMAGE_RESPONSE_NSIO_OPTS` */
export interface NsioImageResponseOptions {
  /** `experimental.imgOptConcurrency`, since the pool is shared with `next/image` */
  concurrency: number | null
  /** `experimental.imageResponseTimeoutInSeconds` */
  timeoutInSeconds: number
}

export async function renderImageResponseWithNsio(
  [element, options]: ImageResponseArgs,
  { concurrency, timeoutInSeconds }: NsioImageResponseOptions
): Promise<Uint8Array> {
  const og: OgModule = await import(
    'next/dist/compiled/@vercel/og/index.node.js'
  )
  // satori renders text as paths and inlines images as data URIs, so the SVG
  // doesn't reference any external resources.
  const nsioSharp: SharpLike = (input) =>
    getNsioPool(concurrency)
      .prepare(input)
      .allowInputFormats(['svg'])
      .timeoutMs(timeoutInSeconds * 1000)
  return og.unstable_renderWithSharp(nsioSharp, element, options)
}
