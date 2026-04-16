import { revalidateTimestampPage } from '../revalidate'

export async function POST(/** @type {Request} */ request) {
  // we can't call revalidatePath from middleware, so we need to do it from here instead
  const path = new URL(request.url).searchParams.get('path')
  if (!path) {
    return Response.json(
      { message: 'Missing "path" search param' },
      { status: 400 }
    )
  }
  await revalidateTimestampPage(path)
  return Response.json({})
}
