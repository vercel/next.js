const requestInsightsGlobal = globalThis as typeof globalThis & {
  requestInsightsPendingAppRouteHandlers?: Map<string, () => void>
}
const pendingHandlers =
  (requestInsightsGlobal.requestInsightsPendingAppRouteHandlers ??= new Map())

export async function GET(request: Request) {
  const waitKey = new URL(request.url).searchParams.get('wait')
  if (waitKey) {
    await new Promise<void>((resolve) => {
      pendingHandlers.set(waitKey, resolve)
    })
  }

  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('started\n'))
        queueMicrotask(() => {
          controller.enqueue(encoder.encode('finished\n'))
          controller.close()
        })
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain',
      },
      status: 202,
    }
  )
}

export function POST(request: Request) {
  const waitKey = new URL(request.url).searchParams.get('release')
  const release = waitKey ? pendingHandlers.get(waitKey) : undefined
  if (!waitKey || !release) {
    return new Response(null, { status: 404 })
  }

  pendingHandlers.delete(waitKey)
  release()
  return new Response(null, { status: 204 })
}
