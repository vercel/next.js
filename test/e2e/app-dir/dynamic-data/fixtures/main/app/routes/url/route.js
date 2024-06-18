export const revalidate = 1

export const GET = async (request) => {
  try {
    const body = JSON.stringify({ url: request.url })
    return new Response(body, {
      headers: {
        'content-type': 'application/json',
      },
    })
  } catch (err) {
    console.log('Caught Error:', err.message)
    return new Response(null, { status: 500 })
  }
}
