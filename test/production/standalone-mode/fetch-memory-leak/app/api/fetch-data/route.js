export const dynamic = 'force-dynamic'

export async function GET() {
  // Fetch large JSON data from our test server
  const res = await fetch(
    `http://localhost:${process.env.TEST_SERVER_PORT}/large-json`,
    { cache: 'no-store' }
  )
  const res2 = await fetch(
    `http://localhost:${process.env.TEST_SERVER_PORT}/large-json`,
    { cache: 'no-store' }
  )
  const data = await res.json()
  const data2 = await res2.json()
  console.log('DATA', data.items?.length)
  console.log('DATA2', data2.items?.length)
  return Response.json({
    itemCount: data.items?.length || 0,
    itemCount2: data2.items?.length || 0,
    timestamp: Date.now(),
  })
}
