export const dynamic = 'error'

export const GET = async (request) => {
  return new Response(
    JSON.stringify({ query: request.formData.get('query') }),
    {
      headers: {
        'content-type': 'application/json',
      },
    }
  )
}
