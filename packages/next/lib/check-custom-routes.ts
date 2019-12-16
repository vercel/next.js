export type Rewrite = {
  source: string
  destination: string
}

export type Redirect = Rewrite & {
  statusCode?: number
}

const allowedStatusCodes = new Set([301, 302, 303, 307, 308])

export default function checkCustomRoutes(
  routes: Array<Rewrite | Redirect>,
  type: 'redirect' | 'rewrite'
): void {
  let numInvalidRoutes = 0
  let hadInvalidStatus = false
  const isRedirect = type === 'redirect'
  const allowedKeys = new Set([
    'source',
    'destination',
    ...(isRedirect ? ['statusCode'] : []),
  ])

  for (const route of routes) {
    const keys = Object.keys(route)
    const invalidKeys = keys.filter(key => !allowedKeys.has(key))
    const invalidParts = []

    // TODO: investigate allowing RegExp directly
    if (!route.source) {
      invalidParts.push('`source` is missing')
    } else if (typeof route.source !== 'string') {
      invalidParts.push('`source` is not a string')
    } else if (!route.source.startsWith('/')) {
      invalidParts.push('`source` does not start with /')
    }

    if (!route.destination) {
      invalidParts.push('`destination` is missing')
    } else if (typeof route.destination !== 'string') {
      invalidParts.push('`destination` is not a string')
    } else if (type === 'rewrite' && !route.destination.startsWith('/')) {
      invalidParts.push('`destination` does not start with /')
    }

    if (isRedirect) {
      const redirRoute = route as Redirect

      if (
        redirRoute.statusCode &&
        !allowedStatusCodes.has(redirRoute.statusCode)
      ) {
        hadInvalidStatus = true
        invalidParts.push(`\`statusCode\` is not undefined or valid statusCode`)
      }
    }

    const hasInvalidKeys = invalidKeys.length > 0
    const hasInvalidParts = invalidParts.length > 0

    if (hasInvalidKeys || hasInvalidParts) {
      console.error(
        `${invalidParts.join(', ')}${
          invalidKeys.length
            ? (hasInvalidParts ? ',' : '') +
              ` invalid field${invalidKeys.length === 1 ? '' : 's'}: ` +
              invalidKeys.join(',')
            : ''
        } for route ${JSON.stringify(route)}`
      )
      numInvalidRoutes++
    }
  }

  if (numInvalidRoutes > 0) {
    if (hadInvalidStatus) {
      console.error(
        `\nValid redirect statusCode values are ${[...allowedStatusCodes].join(
          ', '
        )}`
      )
    }
    console.error()

    throw new Error(`Invalid ${type}${numInvalidRoutes === 1 ? '' : 's'} found`)
  }
}
