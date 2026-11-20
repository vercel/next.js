import { unstable_cache } from 'next/cache'

const getValue = unstable_cache(async () => 'hello world', ['value'])

export async function GET() {
  return Response.json(await getValue())
}
