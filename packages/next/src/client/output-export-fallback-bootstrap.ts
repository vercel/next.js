import type { InitialRSCPayload } from '../shared/lib/app-router-types'
import { callServer } from './app-call-server'
import { findSourceMapURL } from './app-find-source-map-url'
import { processFetch } from './components/router-reducer/fetch-server-response'
import {
  createInitialRSCPayloadFromFallbackPrerender,
  doesFilledFallbackFlightDataMatchRenderedPathname,
} from './flight-data-helpers'
import {
  addOutputExportDataSuffix,
  getCachedOutputExportFallbackBasePath,
  fetchOutputExportFallbackResponse,
  fetchOutputExportNotFoundDataResponse,
  fetchOutputExportNotFoundResponse,
  getConfiguredOutputExportNotFoundCandidate,
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
  resumeUrl: URL | undefined
}

type OutputExportFallbackInitialResponse = {
  initialRSCPayload: InitialRSCPayload
  fallbackBasePath: string | null
}

declare global {
  interface Window {
    __NEXT_EXPORT_FALLBACK?: boolean
    __NEXT_EXPORT_ORIGINAL_URL?: string
  }
}

export function getOutputExportFallbackState(): OutputExportFallbackState {
  return {
    isFallback: Boolean(window.__NEXT_EXPORT_FALLBACK),
    resumeUrl: window.__NEXT_EXPORT_ORIGINAL_URL
      ? new URL(window.__NEXT_EXPORT_ORIGINAL_URL, window.location.href)
      : undefined,
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
        fallbackBasePath: fallbackResult.fallbackUrl.pathname,
      }
    }
  }

  const response =
    (await fetchOutputExportNotFoundDataResponse(renderedUrl, {
      credentials: 'same-origin',
    })) ??
    (await fetchOutputExportNotFoundResponse(renderedUrl, {
      credentials: 'same-origin',
    }))

  return {
    initialRSCPayload: await decodeFallbackPrerenderPayload(
      Promise.resolve(response),
      renderedUrl,
      createFromFetch,
      debugChannel
    ),
    fallbackBasePath:
      getCachedOutputExportFallbackBasePath(
        addOutputExportDataSuffix(renderedUrl)
      ) ?? getConfiguredOutputExportNotFoundCandidate(renderedUrl.pathname),
  }
}

async function decodeFallbackPrerenderPayload(
  responsePromise: Promise<Response>,
  renderedUrl: URL | undefined,
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

export function clearOutputExportOriginalUrl(): void {
  delete window.__NEXT_EXPORT_ORIGINAL_URL
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
