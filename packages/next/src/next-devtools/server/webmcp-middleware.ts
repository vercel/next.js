import type { IncomingMessage, ServerResponse } from 'http'
import z from 'next/dist/compiled/zod'
import { parse as parseContentType } from 'next/dist/compiled/content-type'
import { ApiError } from '../../server/api-utils'
import { parseBody } from '../../server/api-utils/node/parse-body'
import type { McpServerOptions } from '../../server/mcp/get-or-create-mcp-server'
import { getProjectMetadata } from '../../server/mcp/tools/get-project-metadata'
import { getRoutes } from '../../server/mcp/tools/get-routes'
import { getDevelopmentLogs } from '../../server/mcp/tools/get-logs'
import { getServerActionById } from '../../server/mcp/tools/get-server-action-by-id'
import { getCompilationIssues } from '../../server/mcp/tools/get-compilation-issues'
import { getRequestInsights } from '../../server/mcp/tools/get-request-insights'
import {
  convertSegmentTrieToPageMetadata,
  formatPageMetadata,
} from '../../server/mcp/tools/get-page-metadata'
import { formatErrors } from '../../server/mcp/tools/utils/format-errors'
import { NextInstanceErrorState } from '../../server/mcp/tools/next-instance-error-state'
import { isRequestInsightsEnabled } from '../../server/lib/trace/request-insights'
import {
  DEVTOOLS_WEBMCP_ENDPOINT,
  type DevToolsDocumentContext,
  type DevToolsProjectMetadata,
  type DevToolsWebMCPRequest,
  type DevToolsWebMCPResponse,
} from '../shared/webmcp'

export type DevToolsServerOptions = Omit<
  McpServerOptions,
  'sendHmrMessage' | 'getActiveConnectionCount'
> & { bundler: 'turbopack' | 'webpack' }

const routerTypeSchema = z.enum(['app', 'pages'])
const errorStateSchema = z.object({
  routerType: routerTypeSchema,
  buildError: z.string().nullable(),
  errors: z.array(
    z.object({
      id: z.number(),
      type: z.enum(['runtime', 'recoverable', 'console']),
      error: z.object({
        name: z.string(),
        message: z.string(),
        stack: z.string().optional(),
      }),
      frames: z.array(
        z.object({
          file: z.string().nullable(),
          methodName: z.string(),
          line1: z.number().nullable(),
          column1: z.number().nullable(),
        })
      ),
    })
  ),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Validate iteratively so a malformed, deeply nested trie cannot exhaust the
// server stack before the request body limit is reached.
function isPageMetadata(
  value: unknown
): value is NonNullable<DevToolsDocumentContext['pageMetadata']> {
  if (
    !isRecord(value) ||
    (value.routerType !== 'app' && value.routerType !== 'pages')
  ) {
    return false
  }
  if (value.segmentTrie === null) return true
  const pending: Array<{ node: unknown; depth: number }> = [
    { node: value.segmentTrie, depth: 0 },
  ]
  while (pending.length) {
    const { node, depth } = pending.pop()!
    if (depth > 100 || !isRecord(node) || !isRecord(node.children)) {
      return false
    }
    if (node.value !== undefined) {
      if (
        !isRecord(node.value) ||
        typeof node.value.type !== 'string' ||
        typeof node.value.pagePath !== 'string' ||
        (node.value.boundaryType !== null &&
          typeof node.value.boundaryType !== 'string')
      ) {
        return false
      }
    }
    for (const child of Object.values(node.children)) {
      pending.push({ node: child, depth: depth + 1 })
    }
  }
  return true
}

const requestSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('inspect'),
      input: z
        .object({
          view: z.enum([
            'project',
            'page',
            'routes',
            'errors',
            'compilation',
            'logs',
            'server-action',
            'requests',
          ]),
          routerType: routerTypeSchema.optional(),
          actionId: z.string().min(1).optional(),
          requestId: z.string().min(1).optional(),
        })
        .strict(),
      context: z
        .object({
          url: z.string().min(1).optional(),
          errorState: z
            .custom<
              NonNullable<DevToolsDocumentContext['errorState']>
            >((value) => errorStateSchema.safeParse(value).success)
            .optional(),
          pageMetadata: z
            .custom<
              NonNullable<DevToolsDocumentContext['pageMetadata']>
            >(isPageMetadata)
            .optional(),
          htmlRequestId: z.string().min(1).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('compile-route'),
      input: z
        .object({
          path: z.string().min(1).optional(),
          routeSpecifier: z.string().min(1).optional(),
        })
        .strict(),
    })
    .strict(),
])

async function executeRequest(
  options: DevToolsServerOptions,
  request: DevToolsWebMCPRequest
): Promise<unknown> {
  if (request.type === 'compile-route') {
    if (!options.compileRoute) {
      throw new ApiError(
        400,
        'Route compilation requires the Turbopack bundler.'
      )
    }
    const { path, routeSpecifier } = request.input
    if ((path === undefined) === (routeSpecifier === undefined)) {
      throw new ApiError(
        400,
        'Provide exactly one of `path` or `routeSpecifier`.'
      )
    }
    return options.compileRoute(request.input)
  }

  const { input, context } = request
  switch (input.view) {
    case 'project': {
      const metadata = await getProjectMetadata(
        options.projectPath,
        options.getDevServerUrl
      )
      if ('error' in metadata) return metadata
      return {
        ...metadata,
        bundler: options.bundler,
        capabilities: {
          compilation: !!options.getTurbopackProject,
          compileRoute: !!options.compileRoute,
          requestInsights: isRequestInsightsEnabled(),
        },
      } satisfies DevToolsProjectMetadata
    }
    case 'routes':
      return getRoutes(options, { routerType: input.routerType })
    case 'page': {
      if (!context?.pageMetadata || !context.url) {
        throw new ApiError(
          400,
          'Current document page metadata is not available.'
        )
      }
      return formatPageMetadata([
        {
          url: context.url,
          metadata: convertSegmentTrieToPageMetadata(context.pageMetadata),
        },
      ])
    }
    case 'errors': {
      if (!context?.errorState || !context.url) {
        throw new ApiError(
          400,
          'Current document error state is not available.'
        )
      }
      return formatErrors(
        new Map([[context.url, context.errorState]]),
        NextInstanceErrorState
      )
    }
    case 'compilation':
      return getCompilationIssues(
        options.getTurbopackProject ?? (() => undefined)
      )
    case 'logs':
      return getDevelopmentLogs(options.distDir)
    case 'server-action':
      if (!input.actionId) {
        throw new ApiError(400, 'The server-action view requires actionId.')
      }
      return getServerActionById(options.distDir, { actionId: input.actionId })
    case 'requests':
      if (!context?.htmlRequestId) {
        throw new ApiError(
          400,
          'Request insights are not available for the current document.'
        )
      }
      return getRequestInsights({
        htmlRequestId: context.htmlRequestId,
        requestId: input.requestId,
      })
  }
}

export function getDevToolsWebMCPMiddleware(options: DevToolsServerOptions) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(req.url || '', 'http://n')
    if (pathname !== DEVTOOLS_WEBMCP_ENDPOINT) return next()

    const send = (status: number, response: DevToolsWebMCPResponse) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(response))
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return send(405, { error: 'Use POST to query development context.' })
    }
    try {
      let contentType: string | undefined
      try {
        contentType = parseContentType(req.headers['content-type'] || '').type
      } catch {}
      if (contentType !== 'application/json') {
        throw new ApiError(415, 'Content-Type must be application/json.')
      }
      const parsed = requestSchema.safeParse(await parseBody(req, 1024 * 1024))
      if (!parsed.success) {
        throw new ApiError(400, 'Invalid development context request.')
      }
      const data = await executeRequest(options, parsed.data)
      if (isRecord(data) && typeof data.error === 'string') {
        return send(400, { error: data.error })
      }
      send(200, { data })
    } catch (error) {
      send(error instanceof ApiError ? error.statusCode : 500, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
