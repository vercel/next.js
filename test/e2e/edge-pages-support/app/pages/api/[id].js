export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  return new Response(
    JSON.stringify({
      hello: 'again',
      query: Object.fromEntries(req.nextUrl.searchParams),
    })
  )
}
