/**
 * MCP tool for retrieving Turbopack compilation issues from the Next.js dev server.
 *
 * This tool provides fresh compilation issues (errors, warnings, all severities)
 * grouped by route, for all routes that have been compiled in the current dev session.
 *
 * Flow:
 *   MCP client → determine compiled routes from written entrypoints →
 *   look up Endpoint objects from currentEntrypoints →
 *   call endpoint.getIssues() (NAPI) for fresh issues →
 *   return JSON grouped by route.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type { Entrypoints, Issue } from '../../../build/swc/types'
import type { EntryKey } from '../../../shared/lib/turbopack/entry-key'
import { splitEntryKey } from '../../../shared/lib/turbopack/entry-key'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export interface GetCompilationIssuesOptions {
  getCurrentEntrypoints: () => Entrypoints
  getWrittenEntrypoints: () => ReadonlyMap<EntryKey, unknown>
}

interface CompilationIssueOutput {
  severity: string
  stage: string
  filePath: string
  title: unknown
  description?: unknown
  detail?: unknown
  source?: unknown
  additionalSources?: unknown[]
  documentationLink: string
  importTraces?: unknown
  codeFrame?: string
}

interface CompilationIssuesOutput {
  routes: Record<string, { issues: CompilationIssueOutput[] }>
  message?: string
}

function formatIssue(issue: Issue): CompilationIssueOutput {
  return {
    severity: issue.severity,
    stage: issue.stage,
    filePath: issue.filePath,
    title: issue.title,
    description: issue.description,
    detail: issue.detail,
    source: issue.source,
    additionalSources: issue.additionalSources ?? [],
    documentationLink: issue.documentationLink,
    importTraces: issue.importTraces,
    codeFrame: issue.codeFrame,
  }
}

export function registerGetCompilationIssuesTool(
  server: McpServer,
  options: GetCompilationIssuesOptions
) {
  server.registerTool(
    'get_compilation_issues',
    {
      description:
        'Get current Turbopack compilation issues (errors, warnings) for all routes that have been compiled in the current dev session, grouped by route',
      inputSchema: {},
    },
    async (_request) => {
      mcpTelemetryTracker.recordToolCall('mcp/get_compilation_issues')

      try {
        const entrypoints = options.getCurrentEntrypoints()
        const writtenEntrypoints = options.getWrittenEntrypoints()

        // Determine compiled routes from written entrypoints.
        // Each EntryKey is JSON like {"type":"app","side":"server","page":"/page"}.
        // Extract unique page names and look them up in currentEntrypoints.
        const compiledPages = new Set<string>()
        for (const key of writtenEntrypoints.keys()) {
          const { page } = splitEntryKey(key)
          compiledPages.add(page)
        }

        if (compiledPages.size === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  routes: {},
                  message: 'No routes have been compiled yet.',
                }),
              },
            ],
          }
        }

        // For each compiled route, find the Endpoint(s) and call getIssues()
        const output: CompilationIssuesOutput = { routes: {} }

        await Promise.all(
          Array.from(compiledPages).map(async (page) => {
            const appRoute = entrypoints.app.get(page)
            const pageRoute = entrypoints.page.get(page)
            const routeEntry = appRoute ?? pageRoute

            if (!routeEntry) {
              // Route not found in current entrypoints (may have been removed)
              return
            }

            const allIssues: Issue[] = []

            try {
              switch (routeEntry.type) {
                case 'app-page': {
                  const result = await routeEntry.htmlEndpoint.getIssues()
                  allIssues.push(...result.issues)
                  break
                }
                case 'app-route': {
                  const result = await routeEntry.endpoint.getIssues()
                  allIssues.push(...result.issues)
                  break
                }
                case 'page': {
                  const result = await routeEntry.htmlEndpoint.getIssues()
                  allIssues.push(...result.issues)
                  break
                }
                case 'page-api': {
                  const result = await routeEntry.endpoint.getIssues()
                  allIssues.push(...result.issues)
                  break
                }
                default:
                  break
              }
            } catch (err) {
              console.error(
                `[MCP get_compilation_issues] Error getting issues for route ${page}:`,
                err
              )
              return
            }

            output.routes[page] = {
              issues: allIssues.map(formatIssue),
            }
          })
        )

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        }
      }
    }
  )
}
