export function GET() {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('committed'))
        setTimeout(() => {
          controller.error(new Error('app route stream error'))
        }, 50)
      },
    })
  )
}

export const dynamic = 'force-dynamic'
