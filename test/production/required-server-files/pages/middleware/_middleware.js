export async function middleware(req) {
  return new Response(null, { headers: { data: 'hello from middleware' } })
}
