import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'next/dist/compiled/zod'
import type { NextJsHotReloaderInterface } from '../../dev/hot-reloader-types'
import type {
  Endpoint,
  Issue,
  Route,
  StyledString,
} from '../../../build/swc/types'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import type {
  NapiModuleGraphSnapshot,
  NapiModuleInfo,
  NapiModuleReference,
} from '../../../build/swc/generated-native'
import { runInNewContext } from 'node:vm'
import * as Log from '../../../build/output/log'
import { formatImportTraces } from '../../../shared/lib/turbopack/utils'
import { inspect } from 'node:util'

export { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const QUERY_DESCRIPTION = `A piece of JavaScript code that will be executed.
It can access the module graph and extract information it finds useful.
The \`console.log\` function can be used to log messages, which will also be returned in the response.
No Node.js or browser APIs are available, but JavaScript language features are available.
When the user is interested in used exports of modules, you can use the \`export\` property of ModuleReferences (\`incomingReferences\`).
When the user is interested in the import path of a module, follow one of the \`incomingReferences\` with a smaller \`depth\` value than the current module until you hit the root.
Do not try to make any assumptions or estimations. See the typings to see which data you have available. If you don't have the data, tell the user that this data is not available and list alternatives that are available.
See the following TypeScript typings for reference:

\`\`\` typescript
interface Module {
  /// The identifier of the module, which is a unique string.
  /// Example: "[project]/packages/next-app/src/app/folder/page.tsx [app-rsc] (ecmascript, Next.js Server Component)"
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
  /// Separate between application code and node_modules (npm packages, vendor code).
  /// Example: "[project]/pages/folder/index.js",
  /// Example: "[project]/node_modules/.pnpm/next@file+..+next.js+packages+next_@babel+core@7.27.4_@opentelemetry+api@1.7.0_@playwright+te_5kenhtwdm6lrgjpao5hc34lkgy/node_modules/next/dist/compiled/fresh/index.js",
  /// Example: "[project]/apps/site/node_modules/@opentelemtry/api/build/src/trace/instrumentation.js",
  path: string,
  /// The distance to the entries of the module graph. Use this to traverse the graph in the right direction.
  /// This is useful when trying to find the path from a module to the root of the module graph.
  /// Example: 0 for the entrypoint, 1 for the first layer of modules, etc.
  depth: number,
  /// The size of the source code of the module in bytes.
  /// Note that it's not the final size of the generated code, but can be a good indicator of that.
  /// It's only the size of this single module, not the size of the whole subgraph behind it (see retainedSize instead).
  size: number,
  /// The size of the whole subgraph behind this module in bytes.
  /// Use this value if the user is interested in sizes of modules (except when they are interested in the size of the module itself).
  /// Never try to compute the retained size yourself, but use this value instead.
  retainedSize: number,
  /// The modules that are referenced by this module.
  /// Modules could be referenced by \`import\`, \`require\`, \`new URL\`, etc.
  /// Beware cycles in the module graph. You can avoid that by only walking edges with a bigger \`depth\` value than the current module.
  references: ModuleReference[],
  /// The modules that reference this module.
  /// Beware cycles in the module graph. 
  /// You can use this to walk up the graph up to the root. When doing this only walk edges with a smaller \`depth\` value than the current module.
  incomingReferences: ModuleReference[],
}

interface ModuleReference {
  /// The referenced/referencing module.
  module: Module
  /// The thing that is used from the module.
  /// export {name}: The named export that is used.
  /// evaluation: Imported for side effects only.
  /// all: All exports and the side effects.
  export: "evaluation" | "all" | \`export \${string}\`
  /// How this reference affects chunking of the module.
  /// hoisted | sync: The module is placed in the same chunk group as the referencing module.
  /// hoisted: The module is loaded before all "sync" modules.
  /// async: The module forms a separate chunk group which is loaded asynchronously.
  /// isolated: The module forms a separate chunk group which is loaded as separate entry. When it has a name, all modules imported with this name are placed in the same chunk group.
  /// shared: The module forms a separate chunk group which is loaded before the current chunk group. When it has a name, all modules imported with this name are placed in the same chunk group.
  /// traced: The module is not bundled, but the graph is still traced and all modules are included unbundled.
  chunkingType: "hoisted" | "sync" | "async" | "isolated" | \`isolated \${string}\` | "shared" | \`shared \${string}\` | "traced"
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

const console: {
  /// Logs a message to the console.
  /// The message will be returned in the response.
  /// The message can be a string or any other value that can be inspected.
  log: (...data: any[]) => void
}
\`\`\`
`

async function measureAndHandleErrors(
  name: string,
  fn: () => Promise<CallToolResult['content']>
): Promise<CallToolResult> {
  const start = performance.now()
  let content: CallToolResult['content'] = []
  try {
    content = await fn()
  } catch (error) {
    content.push({
      type: 'text',
      text: `Error: ${error instanceof Error ? error.stack : String(error)}`,
    })
    content.push({
      type: 'text',
      text: 'Fix the error and try again.',
    })
  }
  const duration = performance.now() - start
  const formatDurationText =
    duration > 2000
      ? `${Math.round(duration / 100) / 10}s`
      : `${Math.round(duration)}ms`
  Log.event(`MCP ${name} in ${formatDurationText}`)
  return {
    content,
  }
}

function invariant(value: never, errorMessage: (value: any) => string): never {
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

function issueToString(issue: Issue & { route: string }): string {
  return [
    `${issue.severity} in ${issue.stage} on ${issue.route}`,
    `File Path: ${issue.filePath}`,
    issue.source &&
      `Source:
  ${issue.source.source.ident}
  ${issue.source.range ? `Range: ${issue.source.range?.start.line}:${issue.source.range?.start.column} - ${issue.source.range?.end.line}:${issue.source.range?.end.column}` : 'Unknown range'}
`,
    `Title: ${styledStringToMarkdown(issue.title)}`,
    issue.description &&
      `Description:
${indent(styledStringToMarkdown(issue.description))}`,
    issue.detail &&
      `Details:
${indent(styledStringToMarkdown(issue.detail))}`,
    issue.documentationLink && `Documentation: ${issue.documentationLink}`,
    issue.importTraces &&
      issue.importTraces.length > 0 &&
      formatImportTraces(issue.importTraces),
  ]
    .filter(Boolean)
    .join('\n')
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

function arrayOrSingle<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

interface ModuleReference {
  module: Module
  export: string
  chunkingType: string
}
interface Module {
  /// The identifier of the module, which is a unique string.
  ident: string
  /// The path of the module. It's not unique as multiple modules can have the same path.
  path: string
  /// The distance to the entries of the module graph. Use this to traverse the graph in the right direction.
  depth: number
  /// The size of the source code of the module in bytes.
  size: number
  /// The size of the whole subgraph behind this module in bytes.
  retainedSize: number
  /// The modules that are referenced by this module.
  references: ModuleReference[]
  /// The modules that reference this module.
  incomingReferences: ModuleReference[]
}

function createModuleObject(rawModule: NapiModuleInfo): Module {
  return {
    ident: rawModule.ident,
    path: rawModule.path,
    depth: rawModule.depth,
    size: rawModule.size,
    retainedSize: rawModule.retainedSize,
    references: [],
    incomingReferences: [],
  }
}

function processModuleGraphSnapshot(
  moduleGraph: NapiModuleGraphSnapshot,
  modules: Module[],
  entries: Module[]
) {
  const queryModules = moduleGraph.modules.map(createModuleObject)
  for (let i = 0; i < queryModules.length; i++) {
    const rawModule = moduleGraph.modules[i]
    const queryModule = queryModules[i]

    queryModule.references = rawModule.references.map(
      (ref: NapiModuleReference) => ({
        module: queryModules[ref.index],
        export: ref.export,
        chunkingType: ref.chunkingType,
      })
    )
    queryModule.incomingReferences = rawModule.incomingReferences.map(
      (ref: NapiModuleReference) => ({
        module: queryModules[ref.index],
        export: ref.export,
        chunkingType: ref.chunkingType,
      })
    )
    modules.push(queryModule)
  }
  for (const entry of moduleGraph.entries) {
    const queryModule = queryModules[entry]
    entries.push(queryModule)
  }
}

function runQuery(
  query: string,
  modules: Module[],
  entries: Module[]
): CallToolResult['content'] {
  const response: CallToolResult['content'] = []
  const proto = {
    modules,
    entries,
    console: {
      log: (...data: any[]) => {
        response.push({
          type: 'text',
          text: data
            .map((item) =>
              typeof item === 'string' ? item : inspect(item, false, 2, false)
            )
            .join(' '),
        })
      },
    },
  }
  const contextObject = Object.create(proto)
  contextObject.global = contextObject
  contextObject.self = contextObject
  contextObject.globalThis = contextObject
  runInNewContext(query, contextObject, {
    displayErrors: true,
    filename: 'query.js',
    timeout: 20000,
    contextName: 'Query Context',
  })
  for (const [key, value] of Object.entries(contextObject)) {
    if (typeof value === 'function') continue
    if (key === 'global' || key === 'self' || key === 'globalThis') continue
    response.push({
      type: 'text',
      text: `Global variable \`${key}\` = ${inspect(value, false, 2, false)}`,
    })
  }
  return response
}

const ROUTES_DESCRIPTION =
  'The routes from which to query the module graph. Can be a single string or an array of strings.'
export function createMcpServer(
  hotReloader: NextJsHotReloaderInterface
): McpServer | undefined {
  const turbopack = hotReloader.turbopackProject
  if (!turbopack) return undefined
  const server = new McpServer({
    name: 'next.js',
    version: '1.0.0',
    instructions: `This is a running next.js dev server with Turbopack.
You can use the Model Context Protocol to query information about pages and modules and their relations.`,
  })

  server.registerTool(
    'entrypoints',
    {
      title: 'Entrypoints',
      description:
        'Get all entrypoints of a Turbopack project, which are all pages, routes and the middleware.',
    },
    async () =>
      measureAndHandleErrors('entrypoints', async () => {
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
        return content
      })
  )

  server.registerTool(
    'query-routes-module-graph',
    {
      title: 'Query module graph of routes',
      description: 'Query details about the module graph of routes.',
      inputSchema: {
        routes: z
          .union([z.string(), z.array(z.string())])
          .describe(ROUTES_DESCRIPTION),
        query: z.string().describe(QUERY_DESCRIPTION),
      },
    },
    async ({ routes, query }) =>
      measureAndHandleErrors(
        `module graph query on ${arrayOrSingle(routes).join(', ')}`,
        async () => {
          const entrypoints = await turbopack.getEntrypoints()
          const endpoints = []
          for (const route of arrayOrSingle(routes)) {
            const routeInfo = entrypoints.routes.get(route)
            if (!routeInfo) {
              throw new Error(`Route ${route} not found`)
            }
            endpoints.push(...routeToEndpoints(routeInfo))
          }
          const issues = []
          const modules: Module[] = []
          const entries: Module[] = []

          for (const endpoint of endpoints) {
            const result = await endpoint.moduleGraphs()
            issues.push(...result.issues)
            const moduleGraphs = result.moduleGraphs
            for (const moduleGraph of moduleGraphs) {
              processModuleGraphSnapshot(moduleGraph, modules, entries)
            }
          }
          const content: CallToolResult['content'] = []
          content.push(issuesReference(issues))
          const response = runQuery(query, modules, entries)
          content.push(...response)
          return content
        }
      )
  )

  server.registerTool(
    'query-module-graph',
    {
      title: 'Query whole app module graph',
      description:
        'Query details about the module graph the whole application. This is a expensive operation and should only be used when module graph of the whole application is needed.',
      inputSchema: {
        query: z.string().describe(QUERY_DESCRIPTION),
      },
    },
    async ({ query }) =>
      measureAndHandleErrors(`whole app module graph query`, async () => {
        const moduleGraph = await turbopack.moduleGraph()
        const issues = moduleGraph.issues
        const modules: Module[] = []
        const entries: Module[] = []
        processModuleGraphSnapshot(moduleGraph, modules, entries)
        const content: CallToolResult['content'] = []
        content.push(issuesReference(issues))
        const response = runQuery(query, modules, entries)
        content.push(...response)
        return content
      })
  )

  server.registerTool(
    'query-issues',
    {
      title: 'Query issues of routes',
      description:
        'Query issues (errors, warnings, lints, etc.) that are reported on routes.',
      inputSchema: {
        routes: z
          .union([z.string(), z.array(z.string())])
          .describe(ROUTES_DESCRIPTION),
        page: z
          .optional(z.number())
          .describe(
            'Issues are paginated when there are more than 50 issues. The first page is number 0.'
          ),
      },
    },
    async ({ routes, page }) =>
      measureAndHandleErrors(
        `issues on ${arrayOrSingle(routes).join(', ')}`,
        async () => {
          const entrypoints = await turbopack.getEntrypoints()
          const issues = []
          for (const route of arrayOrSingle(routes)) {
            const routeInfo = entrypoints.routes.get(route)
            if (!routeInfo) {
              throw new Error(`Route ${route} not found`)
            }
            for (const endpoint of routeToEndpoints(routeInfo)) {
              const result = await endpoint.moduleGraphs()
              for (const issue of result.issues) {
                const issuesWithRoute = issue as Issue & { route: string }
                issuesWithRoute.route = route
                issues.push(issuesWithRoute)
              }
            }
          }
          const severitiesArray = [
            'bug',
            'fatal',
            'error',
            'warning',
            'hint',
            'note',
            'suggestion',
            'info',
          ]
          const severities = new Map(
            severitiesArray.map((severity, index) => [severity, index])
          )
          issues.sort((a, b) => {
            const severityA = severities.get(a.severity)
            const severityB = severities.get(b.severity)
            if (severityA !== undefined && severityB !== undefined) {
              return severityA - severityB
            }
            return 0
          })

          const content: CallToolResult['content'] = []
          content.push(issuesReference(issues))
          page = page ?? 0
          const currentPage = issues.slice(page * 50, (page + 1) * 50)
          for (const issue of currentPage) {
            content.push({
              type: 'text',
              text: issueToString(issue),
            })
          }
          if (issues.length >= (page + 1) * 50) {
            content.push({
              type: 'text',
              text: `Note: There are more issues available. Use the \`page\` parameter to query the next page.`,
            })
          }

          return content
        }
      )
  )

  return server
}
