/**
 * Compile a selected route via the on-demand entry handler, without making an
 * HTTP request to the route or installing persistent HMR subscriptions.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import {
  type CompileRoute,
  createCompileRouteHandler,
  routeSelectorSchema,
} from './utils/compile-route'

export function registerCompileRouteTool(
  server: McpServer,
  compileRoute: CompileRoute
) {
  server.registerTool(
    'compile_route',
    {
      description:
        'Compile a specific route (page or API route) without making an HTTP request. ' +
        'Provide exactly one of routeSpecifier or path. ' +
        'Triggers the same on-demand compilation the dev server uses when a route is first visited, including its dependencies. ' +
        'Returns { routeSpecifier, issues } on success where routeSpecifier is the resolved route and issues contains any compilation warnings or errors. ' +
        'Returns an error if no matching route exists. Never falls back to compiling all routes. ' +
        'Use tools/list for capability discovery without compilation. A single route can still be expensive; this tool does not enforce a memory limit.',
      inputSchema: routeSelectorSchema,
    },
    createCompileRouteHandler('compile_route', compileRoute)
  )
}
