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
  const isRedirect = type === 'redirect'
  const allowedKeys = new Set([
    'source',
    'destination',
    ...(isRedirect ? ['statusCode'] : []),
  ])

  for (const route of routes) {
    const keys = Object.keys(route)
    const invalidKeys = keys.filter(key => !allowedKeys.has(key))

    // TODO: investigate allowing RegExp directly
    if (typeof route.source !== 'string') {
      invalidKeys.push('source')
    }
    if (typeof route.destination !== 'string') {
      invalidKeys.push('destination')
    }

    if (isRedirect) {
      const redirRoute = route as Redirect

      if (
        redirRoute.statusCode &&
        !allowedStatusCodes.has(redirRoute.statusCode)
      ) {
        invalidKeys.push('statusCode')
      }
    }

    if (invalidKeys.length > 0) {
      console.error(
        `Invalid keys found for route ${JSON.stringify(
          route
        )} found: ${invalidKeys.join(', ')}`
      )
      numInvalidRoutes++
    }
  }

  if (numInvalidRoutes > 0) {
    console.error(
      `\n${type} \`source\` and \`destination\` must be strings ` +
        (isRedirect
          ? `\`statusCode\` must be undefined or ${[...allowedStatusCodes].join(
              ', '
            )} `
          : ``) +
        `and no other fields are allowed` +
        `\n`
    )
    throw new Error(`Invalid ${type}${numInvalidRoutes === 1 ? '' : 's'} found`)
  }
}
