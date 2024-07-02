import type {
  Page,
  Route,
  Request as PlaywrightRequest,
} from '@playwright/test'
import type { FetchHandler } from './next-worker-fixture'

function continueRoute(
  route: Route,
  request: PlaywrightRequest,
  testHeaders: Record<string, string>
): Promise<void> {
  return route.continue({
    headers: {
      ...request.headers(),
      ...testHeaders,
    },
  })
}

async function fetchRoute(
  route: Route,
  request: PlaywrightRequest,
  testHeaders: Record<string, string>
): Promise<void> {
  const response = await route.fetch({
    headers: {
      ...request.headers(),
      ...testHeaders,
    },
  })
  return route.fulfill({ response })
}

export async function handleRoute(
  route: Route,
  page: Page,
  testHeaders: Record<string, string>,
  fetchHandler: FetchHandler | null
) {
  const request = route.request()

  // Continue the navigation and non-fetch requests.
  if (request.isNavigationRequest() || request.resourceType() !== 'fetch') {
    return continueRoute(route, request, testHeaders)
  }

  // Continue the local requests. The followup requests will be intercepted
  // on the server.
  const pageOrigin = new URL(page.url()).origin
  const requestOrigin = new URL(request.url()).origin
  if (pageOrigin === requestOrigin) {
    return fetchRoute(route, request, testHeaders)
  }

  if (!fetchHandler) {
    return route.abort()
  }

  const postData = request.postDataBuffer()
  const fetchRequest = new Request(request.url(), {
    method: request.method(),
    headers: Object.fromEntries(
      Object.entries(request.headers()).filter(
        ([name]) => !name.toLowerCase().startsWith('next-test-')
      )
    ),
    body: postData ?? null,
  })

  const proxyResponse = await fetchHandler(fetchRequest)
  if (!proxyResponse) {
    return route.abort()
  }
  if (proxyResponse === 'abort') {
    return route.abort()
  }
  if (proxyResponse === 'continue') {
    return continueRoute(route, request, testHeaders)
  }
  const { status, headers, body } = proxyResponse
  return route.fulfill({
    status,
    headers: Object.fromEntries(headers),
    body: body ? Buffer.from(await proxyResponse.arrayBuffer()) : undefined,
  })
}
