export const runtime = 'edge'

export const GET = (req) => {
  // use query to trigger dynamic usage
  console.log('query', Object.fromEntries(req.nextUrl.searchParams))
  return new Response('hello world')
}
