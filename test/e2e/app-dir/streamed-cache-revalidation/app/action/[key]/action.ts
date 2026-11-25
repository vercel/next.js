'use server'

import { revalidateTag } from 'next/cache'

export async function invalidateFromStream(key: string) {
  return new ReadableStream<string>({
    async start(controller) {
      controller.enqueue('started')
      await new Promise((resolve) => setTimeout(resolve, 500))
      revalidateTag('streamed:' + key, { expire: 0 })
      controller.enqueue('invalidated')
      controller.close()
    },
  })
}
