import { getGeneratorValue } from '../../../generator-value'

export async function generateStaticParams() {
  return [{ slug: await getGeneratorValue('route') }]
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  return new Response(slug)
}
