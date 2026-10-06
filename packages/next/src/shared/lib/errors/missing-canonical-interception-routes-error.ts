import type { MissingCanonicalInterceptionRoute } from '../router/utils/interception-routes'

export class MissingCanonicalInterceptionRoutesError extends Error {
  constructor(routes: readonly MissingCanonicalInterceptionRoute[]) {
    const formattedRoutes = routes
      .map(
        ({ interceptionRoute, canonicalRoute }) =>
          `- ${interceptionRoute} (expected ${canonicalRoute})`
      )
      .join('\n')
    super(
      `The following interception routes do not have a canonical route:\n${formattedRoutes}\n\nEvery interception route must have a matching non-interception route so the URL can be loaded directly or refreshed.`
    )

    this.name = 'MissingCanonicalInterceptionRoutesError'
    this.stack = undefined
  }
}
