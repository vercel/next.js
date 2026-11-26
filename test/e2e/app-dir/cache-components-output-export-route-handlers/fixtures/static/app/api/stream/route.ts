export function GET() {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Static streamed body'))
        controller.close()
      },
    })
  )
}
