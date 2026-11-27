// The bridge for hosts of the deployment adapter contract on Node, such as `next start`
// and Vercel: owns HTTP for a page on the native RSC runtime and calls the renderer
// interface. The renderer never sees HTTP; this writes the status and headers from the
// outcome it reports.

import { logError } from '#engine-config'
import {
  requestMethod,
  requestSignal,
  writeResponse,
  type HostRequest,
  type HostResponse,
} from '#engine-http'
import { getCacheControlHeader } from 'next/dist/server/lib/cache-control'
import type { RouteRenderer } from '../interface/renderer'

export async function handle(
  renderer: RouteRenderer,
  req: HostRequest,
  res: HostResponse
): Promise<void> {
  // A page only renders. Server Actions and other methods aren't supported yet.
  const method = requestMethod(req)
  if (method !== 'GET' && method !== 'HEAD') {
    await writeResponse(res, 405, [['allow', 'GET, HEAD']], emptyBody())
    return
  }
  const result = renderer.renderDocument({
    signal: requestSignal(res),
    reportError: logError,
  })
  const { outcome } = await result.head
  await writeResponse(
    res,
    outcome.type === 'rendered' ? 200 : 500,
    [
      ['content-type', 'text/html; charset=utf-8'],
      // Every request renders the page, as for dynamic pages on App Router.
      [
        'cache-control',
        getCacheControlHeader({ revalidate: 0, expire: undefined }),
      ],
    ],
    result.body
  )
}

function emptyBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}
