process.env.INJECT_ORDER += ',user'

export async function register() {
  if (!process.env.INJECT_ORDER?.endsWith(',register:last')) {
    throw new Error('last register was not awaited')
  }
  await Promise.resolve()
  process.env.INJECT_ORDER += ',register:user'
}

export async function onRequestError(error, request, context) {
  await Promise.resolve()
  console.log(
    'inject-error',
    'user',
    request.path,
    context.routeType,
    error.message
  )
}
