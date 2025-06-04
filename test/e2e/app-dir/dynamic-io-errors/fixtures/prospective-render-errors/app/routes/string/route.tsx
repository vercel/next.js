let didError = false

export async function GET() {
  errorFirstTime()
  return new Response(
    'This page errors during the prospective render during build. It errors on the first render during dev.'
  )
}

function errorFirstTime() {
  if (!didError) {
    didError = true
    // eslint-disable-next-line no-throw-literal
    throw 'BOOM (string route)'
  }
  return null
}
