const { PHASE_PRODUCTION_BUILD } = require('next/constants')

function getSentinelValue() {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? 'buildtime'
    : 'runtime'
}

/**
 * The phase of the render that filled this cache entry, rather than of the
 * render that reads it.
 *
 * A route whose fallback shell is empty has nothing to serve while its params
 * resolve, so a param the build never named has to be prerendered by the
 * request that asks for it. This reports whether that happened.
 *
 * A prerender carries a resume data cache, and an empty shell carries one too.
 * A request answered by resuming such a shell therefore replays what the build
 * put in this entry and reports `buildtime`, however many times the route is
 * rendered around it. A request that prerenders the route for itself fills the
 * entry while it runs and reports `runtime`.
 *
 * The value has to be read through a cache scope for that. Read directly it
 * reports the phase of the current render, which is `runtime` either way.
 */
export async function getCachedSentinelValue() {
  'use cache'

  return getSentinelValue()
}
