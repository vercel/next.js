import type { ParamMatching } from 'next'

export const policy = { slug: 'fallback' } satisfies ParamMatching
export const preservedLiteral: 'fallback' = policy.slug

export const invalidMode: ParamMatching<'slug'> = {
  // @ts-expect-error Unsupported modes are rejected with contextual typing.
  slug: 'unsupported',
}

export const invalidKey: ParamMatching<'slug'> = {
  // @ts-expect-error Explicit key unions support strict type annotations.
  category: 'blocking',
}
