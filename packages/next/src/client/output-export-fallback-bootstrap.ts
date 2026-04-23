import type { InitialRSCPayload } from '../shared/lib/app-router-types'
import { callServer } from './app-call-server'
import { findSourceMapURL } from './app-find-source-map-url'
import { processFetch } from './components/router-reducer/fetch-server-response'
import { createInitialRSCPayloadFromFallbackPrerender } from './flight-data-helpers'
import {
  addOutputExportDataSuffix,
  fetchOutputExportDataResponse,
  fetchOutputExportFallbackResponse,
  stripOutputExportDataSuffix,
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

declare global {
  interface Window {
    __NEXT_EXPORT_FALLBACK?: boolean
    __NEXT_EXPORT_ORIGINAL_URL?: string
  }
}

const NEXT_EXPORT_ORIGINAL_URL_SESSION_KEY = '__NEXT_EXPORT_ORIGINAL_URL'

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
}): Promise<InitialRSCPayload> {
  const renderedUrl = new URL(window.location.href)
  const fallbackResult = await fetchOutputExportFallbackResponse(renderedUrl, {
    credentials: 'same-origin',
  })

  if (fallbackResult !== null) {
    try {
      sessionStorage.setItem(
        NEXT_EXPORT_ORIGINAL_URL_SESSION_KEY,
        renderedUrl.href
      )
    } catch {}

    const fallbackDocumentUrl = stripOutputExportDataSuffix(
      new URL(fallbackResult.response.url)
    )

    window.location.replace(fallbackDocumentUrl.href)
    return await new Promise<InitialRSCPayload>(() => {})
  }

  const response =
    (await fetchOutputExportDataResponse(new URL('/_not-found', renderedUrl), {
      credentials: 'same-origin',
    })) ??
    (await fetch(
      addOutputExportDataSuffix(new URL('/_not-found', renderedUrl)),
      {
        credentials: 'same-origin',
      }
    ))

  const processedResponse = Promise.resolve(response)
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
