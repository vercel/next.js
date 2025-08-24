export const dynamic = 'error'

export const GET = async (request) => {
  return new Response(
    JSON.stringify({ pathname: request.nextUrl.toString() }),
    {
      headers: {
        'content-type': 'application/json',
      },
    }
  )
}
