import { revalidateTag } from 'next/cache'

export async function POST() {
  await revalidateTag('variable-revalidate-edge-post-method-iterable', {
    expire: 0,
  })

  return new Response('ok')
}
