import { getData } from '../../../../lib/data'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag } = await params
  return new Response(await getData('fetch-tag-rewrite', tag))
}
