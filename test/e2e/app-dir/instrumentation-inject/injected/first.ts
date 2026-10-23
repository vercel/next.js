process.env.INJECT_ORDER = 'first'

export async function register() {
  await Promise.resolve()
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    require('node:fs')
  } else {
    // The Node.js import must not be included in the Edge bundle.
  }
  process.env.INJECT_ORDER += ',register:first'
}

export function onRequestError(error, request, context) {
  console.log(
    'inject-error',
    'first',
    request.path,
    context.routeType,
    error.message
  )
  throw new Error('first hook failed')
}
