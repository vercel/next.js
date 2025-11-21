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
    throw new Error('BOOM (Error route)')
  }
  return null
}
