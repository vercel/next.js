export const runtime = 'edge'

export async function GET() {
  // The edge runtime has no async chunk loading.
  const neverAccessed = await import.defer('../../lib/throws-on-evaluation')
  const data = await import.defer('../../lib/server-data')
  return Response.json({
    value: data.value,
    neverAccessed: typeof neverAccessed,
  })
}
