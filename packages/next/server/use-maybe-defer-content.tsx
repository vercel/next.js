import { MaybeDeferContentHook } from '../shared/lib/utils'
import { DEFERRED_CONTENT_PLACEHOLDER } from '../shared/lib/constants'
import React from 'react'
import ReactDOMServer from 'react-dom/server'

let deferredContentFn: (() => JSX.Element) | null = null

/**
 * This function generates a useMaybeDeferContent hook based on whether the
 * content should be deferred.
 */
export function generateMaybeDeferContentHook(
  isDeferred: boolean
): MaybeDeferContentHook {
  return isDeferred ? deferContent : renderContent
}

/** Display a placeholder that will be replaced later with the result of contentFn(). */
function deferContent(contentFn: () => JSX.Element): JSX.Element {
  deferredContentFn = contentFn
  return <>{DEFERRED_CONTENT_PLACEHOLDER}</>
}

/** Display the result of contentFn() immediately. */
function renderContent(contentFn: () => JSX.Element): JSX.Element {
  return contentFn()
}

export function replacePlaceholderWithContent(html: string): string {
  if (deferredContentFn == null) return html
  const deferredContent = ReactDOMServer.renderToStaticMarkup(
    deferredContentFn()
  )
  return html.replace(DEFERRED_CONTENT_PLACEHOLDER, deferredContent)
}
