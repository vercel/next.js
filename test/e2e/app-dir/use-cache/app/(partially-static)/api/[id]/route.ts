import { getCachedRandomWithCacheLife } from 'my-pkg'
import { NextRequest } from 'next/server'

export async function generateStaticParams() {
  return [{ id: await getCachedRandomWithCacheLife() }]
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  return Response.json({ id })
}
