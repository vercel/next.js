process.env.INJECT_ORDER += ',last'

export async function register() {
  if (!process.env.INJECT_ORDER?.endsWith(',register:first')) {
    throw new Error('first register was not awaited')
  }
  await Promise.resolve()
  process.env.INJECT_ORDER += ',register:last'
}

export async function onRequestError(error, request, context) {
  await Promise.resolve()
  console.log(
    'inject-error',
    'last',
    request.path,
    context.routeType,
    error.message
  )
  throw new Error('last hook failed')
}
