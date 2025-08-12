import { revalidatePath } from 'next/cache'

export async function DELETE(_request, { params }) {
  const pathname = `/${params.pathname.join('/')}`

  let type
  if (pathname.includes('[') && pathname.includes(']')) {
    type = 'page'
  }

  revalidatePath(pathname, type)

  return new Response(
    JSON.stringify({
      pathname,
      type,
    }),
    { status: 200 }
  )
}
