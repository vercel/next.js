import z from 'next/dist/compiled/zod'
import { mcpTelemetryTracker } from '../../mcp-telemetry-tracker'
import type { FormattedIssue } from './format-compilation-issues'

export type RouteSelector = { routeSpecifier?: string; path?: string }

export type CompileRoute = (
  opts: RouteSelector
) => Promise<{ routeSpecifier: string; issues: FormattedIssue[] }>

export const routeSelectorSchema = {
  routeSpecifier: z
    .string()
    .describe(
      'A route specifier as returned by the get_routes tool (e.g. "/", "/blog/[slug]", "/api/users/[id]"). ' +
        'Mutually exclusive with `path`; provide exactly one.'
    )
    .optional(),
  path: z
    .string()
    .describe(
      'A URL path on this site (e.g. "/blog/hello-world", "/docs/a/b/c"). ' +
        'Query strings are allowed and ignored. Do not include scheme/host/port. ' +
        "The path is resolved to its matching route specifier using the dev router's live route table. " +
        'Mutually exclusive with `routeSpecifier`; provide exactly one.'
    )
    .optional(),
}

export function createCompileRouteHandler(
  toolName: 'compile_route' | 'get_compilation_issues',
  compileRoute: CompileRoute
) {
  return async ({ routeSpecifier, path }: RouteSelector) => {
    mcpTelemetryTracker.recordToolCall(`mcp/${toolName}`)

    if ((routeSpecifier == null) === (path == null)) {
      const routeRequired =
        toolName === 'get_compilation_issues' && routeSpecifier == null
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              routeRequired
                ? {
                    code: 'ROUTE_REQUIRED',
                    error:
                      'Provide exactly one of `routeSpecifier` or `path`. Use tools/list for capability discovery without compiling routes.',
                  }
                : {
                    error: 'Provide exactly one of `routeSpecifier` or `path`.',
                  }
            ),
          },
        ],
      }
    }

    try {
      const { routeSpecifier: resolvedRouteSpecifier, issues } =
        await compileRoute({ routeSpecifier, path })
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              routeSpecifier: resolvedRouteSpecifier,
              issues,
            }),
          },
        ],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const notFound =
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              notFound
                ? { notFound: true, input: path ?? routeSpecifier }
                : { input: path ?? routeSpecifier, error: message }
            ),
          },
        ],
      }
    }
  }
}
