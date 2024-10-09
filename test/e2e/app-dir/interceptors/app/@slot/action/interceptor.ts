import { NextRequest } from 'next/server'
import { logWithTime, setTimeout } from '../../time-utils'

export default async function interceptSlot(
  request: NextRequest
): Promise<void> {
  await logWithTime('SlotInterceptor', async () => {
    if (
      request.method === 'POST' &&
      request.headers.get('content-type').startsWith('multipart/form-data')
    ) {
      // Consume the request body to ensure this doesn't break when also
      // consumed in the action handler.
      await request.formData()
    }

    await setTimeout(500)
  })
}
