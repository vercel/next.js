export async function GET() {
  return new Response('', {
    status: 200,
    headers: { 'Set-Cookie': `common-cookie=from-api; Path=/` },
  })
}
