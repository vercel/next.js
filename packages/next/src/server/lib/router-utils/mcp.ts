import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { NextJsHotReloaderInterface } from '../../dev/hot-reloader-types'
import type {
  Endpoint,
  Issue,
  Route,
  StyledString,
} from '../../../build/swc/types'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import type {
  NapiModuleInfo,
  NapiModuleReference,
} from '../../../build/swc/generated-native'
import { runInNewContext } from 'node:vm'
import * as Log from '../../../build/output/log'
import { formatImportTraces } from '../../../shared/lib/turbopack/utils'

export function createMcpServer(
  hotReloader: NextJsHotReloaderInterface
): McpServer | undefined {
  const turbopack = hotReloader.turbopackProject
  if (!turbopack) return undefined
  const server = new McpServer({
    name: 'next.js',
    version: '1.0.0',
    instructions: `This is a running next.js dev server with Turbopack.
You can use the Model Context Protocol to query information about pages and modules and their relations.


`,
  })

  function invariant(
    value: never,
    errorMessage: (value: any) => string
  ): never {
    throw new Error(errorMessage(value))
  }

  function styledStringToMarkdown(
    styledString: StyledString | undefined
  ): string {
    if (!styledString) {
      return ''
    }
    switch (styledString.type) {
      case 'text':
        return styledString.value
      case 'strong':
        return `*${styledString.value}*`
      case 'code':
        return `\`${styledString.value}\``
      case 'line':
        return styledString.value.map(styledStringToMarkdown).join('')
      case 'stack':
        return styledString.value.map(styledStringToMarkdown).join('\n\n')
      default:
        invariant(styledString, (s) => `Unknown styled string type: ${s.type}`)
    }
  }

  function indent(str: string, spaces: number = 2): string {
    const indentStr = ' '.repeat(spaces)
    return `${indentStr}${str.replace(/\n/g, `\n${indentStr}`)}`
  }

  function issueToString(issue: Issue): string {
    return (
      `${issue.severity} in ${issue.stage} {` +
      indent(
        [
          `File Path: ${issue.filePath}`,
          issue.source &&
            `Source:
  ${issue.source.source.ident}
  ${issue.source.range ? `Range: ${issue.source.range?.start.line}:${issue.source.range?.start.column} - ${issue.source.range?.end.line}:${issue.source.range?.end.column}` : 'Unknown range'}
`,
          `Title: ${issue.title}`,
          issue.description &&
            `Description:
${indent(styledStringToMarkdown(issue.description))}`,
          issue.detail &&
            `Details:
${indent(styledStringToMarkdown(issue.detail))}`,
          issue.documentationLink &&
            `Documentation: ${issue.documentationLink}`,
          issue.importTraces &&
            issue.importTraces.length > 0 &&
            formatImportTraces(issue.importTraces),
        ]
          .filter(Boolean)
          .join('\n')
      ) +
      '\n}'
    )
  }

  function issuesReference(issues: Issue[]): { type: 'text'; text: string } {
    if (issues.length === 0) {
      return {
        type: 'text',
        text: 'Note: There are no issues.',
      }
    }

    const countBySeverity = new Map()

    for (const issue of issues) {
      const count = countBySeverity.get(issue.severity) || 0
      countBySeverity.set(issue.severity, count + 1)
    }

    const text = [
      `Note: There are ${issues.length} issues in total, with the following severities: ${Array.from(
        countBySeverity.entries()
      )
        .map(([severity, count]) => `${count} x ${severity}`)
        .join(', ')}.`,
    ]

    const reportedSeverities = ['bug', 'fatal', 'error', 'warning']

    const reportedServerity = reportedSeverities.find(
      (severity) => countBySeverity.get(severity) > 0
    )

    if (reportedServerity) {
      const count = countBySeverity.get(reportedServerity) || 0
      const visibleCount = Math.min(count, 5)
      text.push(
        `Showing the first ${visibleCount} of ${count} issues of severity \`${reportedServerity}\`:`
      )
      let remainingCount = visibleCount
      for (const issue of issues) {
        if (issue.severity !== reportedServerity) {
          continue
        }
        text.push(`- ${issueToString(issue)}`)
        remainingCount--
        if (remainingCount <= 0) {
          break
        }
      }
    }

    return {
      type: 'text',
      text: text.join('\n'),
    }
  }

  function routeToTitle(route: Route): string {
    switch (route.type) {
      case 'page':
        return 'A page using Pages Router.'
      case 'app-page':
        return `A page using App Router. Original names: ${route.pages.map((page) => page.originalName).join(', ')}.`
      case 'page-api':
        return 'An API route using Pages Router.'
      case 'app-route':
        return `A route using App Router. Original name: ${route.originalName}.`
      case 'conflict':
        return 'Multiple routes conflict on this path. This is an error in the folder structure.'
      default:
        invariant(route, (r) => `Unknown route type: ${r.type}`)
    }
  }

  function routeToEndpoints(route: Route): Endpoint[] {
    switch (route.type) {
      case 'page':
        return [route.htmlEndpoint]
      case 'app-page':
        return route.pages.map((p) => p.htmlEndpoint)
      case 'page-api':
        return [route.endpoint]
      case 'app-route':
        return [route.endpoint]
      case 'conflict':
        return []
      default:
        invariant(route, (r) => `Unknown route type: ${r.type}`)
    }
  }

  server.registerTool(
    'entrypoints',
    {
      title: 'Entrypoints',
      description:
        'Get all entrypoints of a Turbopack project, which are all pages, routes and the middleware. Also reports issues found while accumulating the entrypoints.',
    },
    async () => {
      const start = performance.now()
      let entrypoints = await turbopack.getEntrypoints()

      const list = []

      for (const [key, route] of entrypoints.routes.entries()) {
        list.push(`\`${key}\` (${routeToTitle(route)})`)
      }

      if (entrypoints.middleware) {
        list.push('Middleware')
      }

      if (entrypoints.instrumentation) {
        list.push('Instrumentation')
      }

      const content: CallToolResult['content'] = [
        issuesReference(entrypoints.issues),
        {
          type: 'text',
          text: `These are the routes of the application:

${list.map((e) => `- ${e}`).join('\n')}`,
        },
      ]
      const duration = performance.now() - start
      const formatDurationText =
        duration > 2000
          ? `${Math.round(duration / 100) / 10}s`
          : `${Math.round(duration)}ms`
      Log.event(`MCP entrypoints in ${formatDurationText}`)
      return {
        content,
      }
    }
  )

  server.registerTool(
    'query-module-graph',
    {
      title: 'Query module graph',
      description:
        'Query details about the module graph of a route. Also reports issues found in that route.',
      inputSchema: {
        route: z
          .string()
          .describe('The route from which to query the module graph.'),
        query: z.string().describe(
          `A piece of JavaScript code that will be executed.
It can access the module graph and log out information it finds useful.
The value of all newly created global variables will be returned in the response and can be used to report results.
See the following TypeScript typings for reference:

\`\`\` typescript
interface Module {
  /// The identifier of the module, which is a unique string.
  /// Example: "[project]/packages/next-app/src/app/folder/page.tsx [app-rsc] (ecmascript, Next.js Server Component) <locals>"
  /// These layers exist in App Router:
  /// * Server Components: [app-rsc], [app-edge-rsc]
  /// * API routes: [app-route], [app-edge-route]
  /// * Client Components: [app-client]
  /// * Server Side Rendering of Client Components: [app-ssr], [app-edge-ssr]
  /// These layers exist in Pages Router:
  /// * Client-side rendering: [client]
  /// * Server-side rendering: [ssr], [edge-ssr]
  /// * API routes: [api], [edge-api]
  /// And these layers also exist:
  /// * Middleware: [middleware], [middleware-edge]
  /// * Instrumentation: [instrumentation], [instrumentation-edge]
  ident: string,
  /// The path of the module. It's not unique as multiple modules can have the same path.
  /// Example: "[project]/pages/folder/index.js",
  path: string,
  /// The distance to the entries of the module graph. Use this to traverse the graph in the right direction.
  /// Example: 0 for the entrypoint, 1 for the first layer of modules, etc.
  depth: number,
  /// The modules that are referenced by this module.
  /// Modules could be references by \`import\`, \`require\`, \`new URL\`, etc.
  references: ModuleReference[],
  /// The modules that reference this module.
  incomingReferences: ModuleReference[],
}

interface ModuleReference {
  module: Module
}

// The following global variables are available in the query:

/// The entries of the module graph.
/// Note that this only includes the entrypoints of the module graph and not all modules.
/// You need to traverse it recursively to find not only children, but also grandchildren (resp, grandparents).
/// Prefer to use \`modules\` over \`entries\` as it contains all modules, not only the entrypoints.
const entries: Module[]

/// All modules in the module graph.
/// Note that this array already contains all the modules as flat list.
/// Make sure to iterate over this array and not only consider the first one.
/// Prefer to use \`modules\` over \`entries\` as it contains all modules, not only the entrypoints.
const modules: Module[]

// Helper methods available in scope:

/// Prints the gives data as JSON to the tool response.
/// It might be useful to use a string as first argument to identify the result in the response when using multiple different log calls.
declare function log(...data: any[]): void

/// Finds a path to the root of the module graph, starting from the given module.
/// The return value is an array of modules, starting with the given module and ending with the root module.
/// When the user asks to find a module, they are often interested to know the path of the module too.
declare function findPathToRoot(module: Module): Module[];
\`\`\`
`
        ),
      },
    },
    async ({ route, query }) => {
      const start = performance.now()
      const entrypoints = await turbopack.getEntrypoints()
      const routeInfo = entrypoints.routes.get(route)
      if (!routeInfo) {
        throw new Error(`Route ${route} not found`)
      }
      const endpoints = routeToEndpoints(routeInfo)
      const issues = []
      const modules = []
      const entries = []

      function createModuleObject(rawModule: NapiModuleInfo): Module {
        return {
          ident: rawModule.ident,
          path: rawModule.path,
          depth: rawModule.depth,
          references: [],
          incomingReferences: [],
        }
      }
      for (const endpoint of endpoints) {
        const result = await endpoint.moduleGraphs()
        issues.push(...result.issues)
        const moduleGraphs = result.moduleGraphs
        for (const moduleGraph of moduleGraphs) {
          const queryModules = moduleGraph.modules.map(createModuleObject)
          for (let i = 0; i < queryModules.length; i++) {
            const rawModule = moduleGraph.modules[i]
            const queryModule = queryModules[i]

            queryModule.references = rawModule.references.map(
              (ref: NapiModuleReference) => ({
                module: queryModules[ref.i],
              })
            )
            queryModule.incomingReferences = rawModule.incomingReferences.map(
              (ref: NapiModuleReference) => ({
                module: queryModules[ref.i],
              })
            )
            modules.push(queryModule)
          }
          for (const entry of moduleGraph.entries) {
            const queryModule = queryModules[entry]
            entries.push(queryModule)
          }
        }
      }
      const content: CallToolResult['content'] = []
      content.push(issuesReference(issues))
      try {
        const response = runQuery(query, modules, entries)
        content.push(...response)
      } catch (error) {
        content.push({
          type: 'text',
          text: `Error while running query: ${
            error instanceof Error ? error.stack : String(error)
          }`,
        })
        content.push({
          type: 'text',
          text: 'Fix the query and try again.',
        })
      }
      const duration = performance.now() - start
      const formatDurationText =
        duration > 2000
          ? `${Math.round(duration / 100) / 10}s`
          : `${Math.round(duration)}ms`
      Log.event(`MCP query on ${route} in ${formatDurationText}`)
      return {
        content,
      }
    }
  )

  return server
}

interface ModuleReference {
  module: Module
}
interface Module {
  /// The identifier of the module, which is a unique string.
  ident: string
  /// The path of the module. It's not unique as multiple modules can have the same path.
  path: string
  /// The distance to the entries of the module graph. Use this to traverse the graph in the right direction.
  depth: number
  /// The modules that are referenced by this module.
  references: ModuleReference[]
  /// The modules that reference this module.
  incomingReferences: ModuleReference[]
}

function runQuery(
  query: string,
  modules: Module[],
  entries: Module[]
): CallToolResult['content'] {
  const response: CallToolResult['content'] = []
  const contextObject = Object.create({
    modules,
    entries,
    log: (...data: any[]) => {
      response.push({
        type: 'text',
        text: `Log: ${data.map((d) => JSON.stringify(d, null, 2)).join('\n')}`,
      })
    },
    findPathToRoot: (module: Module): Module[] => {
      const path: Module[] = []
      let current: Module | undefined = module
      while (current) {
        path.push(current)
        const depth: number = current.depth
        const reference: ModuleReference | undefined =
          current.incomingReferences.find((ref) => ref.module.depth < depth)
        current = reference?.module
      }
      return path.reverse()
    },
  })
  runInNewContext(query, contextObject, {
    displayErrors: true,
    filename: 'query.js',
    timeout: 5000,
    contextName: 'Query Context',
  })
  for (const [key, value] of Object.entries(contextObject)) {
    if (typeof value === 'function') continue
    response.push({
      type: 'text',
      text: `Global variable \`${key}\` = ${JSON.stringify(value, null, 2)}`,
    })
  }
  return response
}
