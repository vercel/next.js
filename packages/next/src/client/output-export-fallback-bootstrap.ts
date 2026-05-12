import type { InitialRSCPayload } from '../shared/lib/app-router-types'
import { callServer } from './app-call-server'
import { findSourceMapURL } from './app-find-source-map-url'
import { processFetch } from './components/router-reducer/fetch-server-response'
import {
  createInitialRSCPayloadFromFallbackPrerender,
  doesFilledFallbackFlightDataMatchRenderedPathname,
} from './flight-data-helpers'
import {
  fetchOutputExportFallbackResponse,
  fetchOutputExportNotFoundDataResponse,
  fetchOutputExportNotFoundResponse,
} from './output-export-fallback'

type DebugChannel =
  | { readable?: ReadableStream; writable?: WritableStream }
  | undefined

type CreateFromFetch = <T>(
  promiseForResponse: Promise<Response>,
  options: {
    callServer: typeof callServer
    findSourceMapURL: typeof findSourceMapURL
    debugChannel?: DebugChannel
    unstable_allowPartialStream?: boolean
  }
) => Promise<T>

type OutputExportFallbackState = {
  isFallback: boolean
}

type OutputExportFallbackInitialResponse = {
  initialRSCPayload: InitialRSCPayload
  staticExportFallbackPathname: string | null
}

declare global {
  interface Window {
    __NEXT_EXPORT_FALLBACK?: boolean
  }
}

export function getOutputExportFallbackState(): OutputExportFallbackState {
  return {
    isFallback: Boolean(window.__NEXT_EXPORT_FALLBACK),
  }
}

export async function createOutputExportFallbackInitialResponse({
  createFromFetch,
  debugChannel,
}: {
  createFromFetch: CreateFromFetch
  debugChannel: DebugChannel
}): Promise<OutputExportFallbackInitialResponse> {
  const renderedUrl = new URL(window.location.href)
  const fallbackResult = await fetchOutputExportFallbackResponse(renderedUrl, {
    credentials: 'same-origin',
  })

  if (fallbackResult !== null) {
    const fallbackPayload = await decodeFallbackPrerenderPayload(
      Promise.resolve(fallbackResult.response),
      renderedUrl,
      createFromFetch,
      debugChannel
    )

    if (
      doesFilledFallbackFlightDataMatchRenderedPathname(
        fallbackPayload.f,
        renderedUrl.pathname
      )
    ) {
      return {
        initialRSCPayload: fallbackPayload,
        staticExportFallbackPathname: fallbackResult.fallbackUrl.pathname,
      }
    }
  }

  // If the fallback route shape does not match the requested URL, prefer a
  // visible not-found result over hydrating a shell with params from the wrong
  // route.
  const notFoundResult =
    (await fetchOutputExportNotFoundDataResponse(renderedUrl, {
      credentials: 'same-origin',
    })) ??
    (await fetchOutputExportNotFoundResponse(renderedUrl, {
      credentials: 'same-origin',
    }))

  return {
    initialRSCPayload: await decodeFallbackPrerenderPayload(
      Promise.resolve(notFoundResult.response),
      renderedUrl,
      createFromFetch,
      debugChannel
    ),
    staticExportFallbackPathname: notFoundResult.fallbackUrl.pathname,
  }
}

async function decodeFallbackPrerenderPayload(
  responsePromise: Promise<Response>,
  renderedUrl: URL,
  createFromFetch: CreateFromFetch,
  debugChannel: DebugChannel
): Promise<InitialRSCPayload> {
  const processedResponse = responsePromise
    .then(processFetch)
    .then(({ response: processed }) => processed)

  const fallbackInitialRSCPayload = await createFromFetch<InitialRSCPayload>(
    processedResponse,
    {
      callServer,
      findSourceMapURL,
      debugChannel,
      unstable_allowPartialStream: true,
    }
  )

  return createInitialRSCPayloadFromFallbackPrerender(
    await processedResponse,
    fallbackInitialRSCPayload,
    renderedUrl
  )
}

export function removeOutputExportFallbackStyleOnCommit(
  appElement: HTMLElement | Document
): void {
  const observer = new MutationObserver(() => {
    document.getElementById('__next-export-fallback-style')?.remove()
    observer.disconnect()
  })
  observer.observe(appElement, { childList: true })
}
