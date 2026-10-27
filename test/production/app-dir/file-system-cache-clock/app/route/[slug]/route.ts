import { getData } from '../../../lib/data'

// Only this slug is prerendered. The tests request a different one, so its
// entries are written at runtime.
export function generateStaticParams() {
  return [{ slug: 'build' }]
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  return new Response(await getData(`route/${slug}`))
}
