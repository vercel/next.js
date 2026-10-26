/**
 * Get compilation issues for one selected route using the same on-demand
 * compilation as compile_route. Never constructs the whole-app module graph.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import {
  type CompileRoute,
  createCompileRouteHandler,
  routeSelectorSchema,
} from './utils/compile-route'

export function registerGetCompilationIssuesTool(
  server: McpServer,
  compileRoute: CompileRoute
) {
  server.registerTool(
    'get_compilation_issues',
    {
      description:
        'Compile one selected route and return its compilation issues (resolve errors, missing modules, transform errors, etc.). ' +
        "Provide exactly one of routeSpecifier or path. Includes the route's layouts, imports and shared dependencies as applicable; does not require a browser session. " +
        'Returns { routeSpecifier, issues }, matching compile_route. Empty calls return a ROUTE_REQUIRED error without compiling. ' +
        'Never falls back to compiling all routes. Use tools/list for capability discovery without compilation. ' +
        'A single route can still be expensive; this tool does not enforce a memory limit.',
      inputSchema: routeSelectorSchema,
    },
    createCompileRouteHandler('get_compilation_issues', compileRoute)
  )
}
