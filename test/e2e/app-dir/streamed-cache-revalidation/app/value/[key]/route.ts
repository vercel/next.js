import { getValue } from '../../cache'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  return Response.json(await getValue(key))
}
