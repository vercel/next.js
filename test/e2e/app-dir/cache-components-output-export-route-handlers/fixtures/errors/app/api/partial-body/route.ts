export function GET() {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Partial body'))
      },
      pull() {
        // The next read never completes, regardless of event-loop timing.
        return new Promise<void>(() => {})
      },
    })
  )
}
