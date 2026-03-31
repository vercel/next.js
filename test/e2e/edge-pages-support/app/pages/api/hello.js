export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  return new Response(
    JSON.stringify({
      hello: 'world',
      query: Object.fromEntries(req.nextUrl.searchParams),
    })
  )
}
