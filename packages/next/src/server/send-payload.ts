import type { IncomingMessage, ServerResponse } from 'http'
import type RenderResult from './render-result'
import type { CacheControl } from './lib/cache-control'
import type { MarkdownConfig } from './lib/markdown-for-agents/config'

import { isResSent } from '../shared/lib/utils'
import { generateETag } from './lib/etag'
import fresh from 'next/dist/compiled/fresh'
import { getCacheControlHeader } from './lib/cache-control'
import { HTML_CONTENT_TYPE_HEADER } from '../lib/constants'
import { getRequestMeta } from './request-meta'
import {
  appendVary,
  negotiateRepresentation,
} from './lib/markdown-for-agents/accept'
import { loadAuthoredRepresentation } from './lib/markdown-for-agents/authored'
import { normalizeMarkdownConfig } from './lib/markdown-for-agents/config'
import { transformPageRepresentation } from './lib/markdown-for-agents/transform'

export function sendEtagResponse(
  req: IncomingMessage,
  res: ServerResponse,
  etag: string | undefined
): boolean {
  if (etag) {
    /**
     * The server generating a 304 response MUST generate any of the
     * following header fields that would have been sent in a 200 (OK)
     * response to the same request: Cache-Control, Content-Location, Date,
     * ETag, Expires, and Vary. https://tools.ietf.org/html/rfc7232#section-4.1
     */
    res.setHeader('ETag', etag)
  }

  if (fresh(req.headers, { etag })) {
    res.statusCode = 304
    res.end()
    return true
  }

  return false
}

export async function sendRenderResult({
  req,
  res,
  result,
  generateEtags,
  poweredByHeader,
  cacheControl,
  markdown,
  dir,
}: {
  req: IncomingMessage
  res: ServerResponse
  result: RenderResult
  generateEtags: boolean
  poweredByHeader: boolean
  cacheControl: CacheControl | undefined
  markdown?: MarkdownConfig
  dir?: string
}): Promise<void> {
  if (isResSent(res)) {
    return
  }

  if (poweredByHeader && result.contentType === HTML_CONTENT_TYPE_HEADER) {
    res.setHeader('X-Powered-By', 'Next.js')
  }

  // If cache control is already set on the response we don't
  // override it to allow users to customize it via next.config
  if (cacheControl && !res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', getCacheControlHeader(cacheControl))
  }

  let payload: string | null = result.isDynamic
    ? null
    : result.toUnchunkedString()
  let markdownApplied = false

  const markdownConfig = normalizeMarkdownConfig(markdown)
  const isRsc = Boolean(getRequestMeta(req, 'isRSCRequest'))
  const forced = getRequestMeta(req, 'markdownRepresentation')
  const acceptHeader =
    typeof req.headers.accept === 'string' ? req.headers.accept : undefined
  const wantsAlternate =
    Boolean(forced) ||
    negotiateRepresentation(acceptHeader, ['html', 'markdown', 'plain']) !==
      'html'
  if (
    markdownConfig.enabled &&
    !isRsc &&
    wantsAlternate &&
    result.contentType === HTML_CONTENT_TYPE_HEADER
  ) {
    const html =
      payload ?? (result.isDynamic ? await result.toUnchunkedString(true) : '')
    const match = getRequestMeta(req, 'match')
    const authored = dir
      ? await loadAuthoredRepresentation({
          dir,
          pageFilename: match?.definition.filename,
          page: match?.definition.page,
        })
      : {}
    const url = (req.url || '/').split('?')[0] || '/'
    const transformed = transformPageRepresentation({
      accept: acceptHeader,
      html,
      url,
      config: markdownConfig,
      authored,
      forced: markdownConfig.suffix ? (forced ?? null) : null,
    })
    res.setHeader(
      'Vary',
      appendVary(
        res.getHeader('Vary') as string | string[] | undefined,
        'Accept'
      )
    )
    if (transformed) {
      payload = transformed.body
      markdownApplied = true
      res.setHeader('Content-Type', transformed.contentType)
      if (transformed.markdownTokens != null) {
        res.setHeader('x-markdown-tokens', String(transformed.markdownTokens))
      }
      if (transformed.originalTokens != null) {
        res.setHeader('x-original-tokens', String(transformed.originalTokens))
      }
      res.removeHeader('ETag')
      res.removeHeader('Last-Modified')
    }
  }

  if (generateEtags && payload !== null) {
    const etag = generateETag(payload)
    if (sendEtagResponse(req, res, etag)) {
      return
    }
  }

  if (!res.getHeader('Content-Type') && result.contentType) {
    res.setHeader('Content-Type', result.contentType)
  }

  if (payload) {
    res.setHeader('Content-Length', Buffer.byteLength(payload))
  }

  if (req.method === 'HEAD') {
    res.end(null)
    return
  }

  if (payload !== null) {
    res.end(payload)
    return
  }

  if (markdownApplied) {
    return
  }

  // Pipe the render result to the response after we get a writer for it.
  await result.pipeToNodeResponse(res)
}
