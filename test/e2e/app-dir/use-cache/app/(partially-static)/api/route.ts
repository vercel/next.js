import { getCachedRandomWithTag } from 'my-pkg'

export async function GET() {
  const rand1 = await getCachedRandomWithTag('api')
  const rand2 = await getCachedRandomWithTag('api')

  return Response.json({ rand1, rand2 })
}
