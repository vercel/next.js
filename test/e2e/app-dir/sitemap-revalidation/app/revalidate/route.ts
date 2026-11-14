import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const type = new URL(request.url).searchParams.get('type')

  if (type === 'tag') {
    revalidateTag('sitemap-revalidation:tagged', 'max')
  } else if (type === 'path') {
    revalidatePath('/sitemap-revalidation/tagged/sitemap.xml')
  } else {
    return new Response('Unknown revalidation type', { status: 400 })
  }

  return new Response(null, { status: 204 })
}
