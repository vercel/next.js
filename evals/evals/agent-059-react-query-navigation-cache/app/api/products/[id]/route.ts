import { getProduct } from '@/lib/products'

export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/products/[id]'>
) {
  const { id } = await params
  return Response.json(await getProduct(id))
}
