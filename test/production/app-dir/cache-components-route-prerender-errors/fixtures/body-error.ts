import { setImmediate } from 'node:timers/promises'

export function GET() {
  return new Response(
    new ReadableStream({
      async pull(controller) {
        await setImmediate()
        controller.error(new Error('body failed after an immediate'))
      },
    })
  )
}
