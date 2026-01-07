export const dynamic = 'force-static'
export const revalidate = 3

export async function GET() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'no-store' }
  ).then((res) => res.text())

  return Response.json({ now: Date.now(), data })
}
