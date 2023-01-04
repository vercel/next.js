export default async (req) => {
  if (!req.body) {
    return new Response('Body is required', { status: 400 })
  }

  return new Response(`got: ${await req.text()}`)
}

export const config = {
  runtime: 'edge',
}
