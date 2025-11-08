/**
 * MCP tool for getting all routes that become entry points in a Next.js application.
 *
 * This tool discovers routes by scanning the filesystem directly. It finds all route
 * files in the app/ and pages/ directories and converts them to route paths.
 *
 * Returns routes grouped by router type:
 * - appRouter: App Router pages and route handlers
 * - pagesRouter: Pages Router pages and API routes
 *
 * Dynamic route segments appear as [id], [slug], or [...slug] patterns. This tool
 * does NOT expand getStaticParams - it only shows the route patterns as defined in
 * the filesystem.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'
import {
  collectAppFiles,
  collectPagesFiles,
  processAppRoutes,
  processPageRoutes,
  createPagesMapping,
} from '../../../build/entries'
import { createValidFileMatcher } from '../../lib/find-page-file'
import { PAGE_TYPES } from '../../../lib/page-types'
import type { NextConfigComplete } from '../../../server/config-shared'
import z from 'next/dist/compiled/zod'

interface RouteInfo {
  route: string
  type: 'app' | 'page' | 'api'
}

export function registerGetRoutesTool(
  server: McpServer,
  options: {
    projectPath: string
    nextConfig: NextConfigComplete
    pagesDir: string | undefined
    appDir: string | undefined
  }
) {
  server.registerTool(
    'get_routes',
    {
      description:
        'Get all routes that will become entry points in the Next.js application by scanning the filesystem. Returns routes grouped by router type (appRouter, pagesRouter). Dynamic segments appear as [param] or [...slug] patterns. API routes are included in their respective routers (e.g., /api/* routes from pages/ are in pagesRouter). Optional parameter: routerType ("app" | "pages") - filter by specific router type, omit to get all routes.',
      inputSchema: {
        routerType: z.union([z.literal('app'), z.literal('pages')]).optional(),
      },
    },
    async (request) => {
      // Track telemetry
      mcpTelemetryTracker.recordToolCall('mcp/get_routes')

      try {
        const routerType =
          request.routerType === 'app' || request.routerType === 'pages'
            ? request.routerType
            : undefined

        const routes: RouteInfo[] = []

        const { projectPath, nextConfig, pagesDir, appDir } = options

        // Check if we have any directories to scan
        if (!pagesDir && !appDir) {
          return {
            content: [
              {
                type: 'text',
                text: 'No pages or app directory found in the project.',
              },
            ],
          }
        }

        const isSrcDir =
          (pagesDir && pagesDir.includes('/src/')) ||
          (appDir && appDir.includes('/src/'))

        // Create valid file matcher for filtering
        const validFileMatcher = createValidFileMatcher(
          nextConfig.pageExtensions,
          appDir
        )

        // Collect and process App Router routes if requested
        if (appDir && (!routerType || routerType === 'app')) {
          try {
            const { appPaths } = await collectAppFiles(appDir, validFileMatcher)

            if (appPaths.length > 0) {
              const mappedAppPages = await createPagesMapping({
                pagePaths: appPaths,
                isDev: true,
                pagesType: PAGE_TYPES.APP,
                pageExtensions: nextConfig.pageExtensions,
                pagesDir,
                appDir,
                appDirOnly: pagesDir ? false : true,
              })

              const { appRoutes, appRouteHandlers } = processAppRoutes(
                mappedAppPages,
                validFileMatcher,
                projectPath,
                isSrcDir || false
              )

              // Add app page routes
              for (const { route } of appRoutes) {
                routes.push({
                  route,
                  type: 'app',
                })
              }

              // Add app route handlers
              for (const { route } of appRouteHandlers) {
                routes.push({
                  route,
                  type: 'app',
                })
              }
            }
          } catch (error) {
            // Error collecting app routes - continue anyway
          }
        }

        // Collect and process Pages Router routes if requested
        if (pagesDir && (!routerType || routerType === 'pages')) {
          try {
            const pagePaths = await collectPagesFiles(
              pagesDir,
              validFileMatcher
            )

            if (pagePaths.length > 0) {
              const mappedPages = await createPagesMapping({
                pagePaths,
                isDev: true,
                pagesType: PAGE_TYPES.PAGES,
                pageExtensions: nextConfig.pageExtensions,
                pagesDir,
                appDir,
                appDirOnly: false,
              })

              const { pageRoutes, pageApiRoutes } = processPageRoutes(
                mappedPages,
                projectPath,
                isSrcDir || false
              )

              // Add page routes
              for (const { route } of pageRoutes) {
                routes.push({
                  route,
                  type: 'page',
                })
              }

              // Add API routes (always included as part of pages router)
              for (const { route } of pageApiRoutes) {
                routes.push({
                  route,
                  type: 'api',
                })
              }
            }
          } catch (error) {
            // Error collecting pages routes - continue anyway
          }
        }

        if (routes.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No routes found in the project.',
              },
            ],
          }
        }

        // Group routes by router type
        const appRoutes = routes
          .filter((r) => r.type === 'app')
          .map((r) => r.route)
          .sort()
        const pageRoutes = routes
          .filter((r) => r.type === 'page' || r.type === 'api')
          .map((r) => r.route)
          .sort()

        // Format the output with grouped routes
        const output = {
          appRouter: appRoutes.length > 0 ? appRoutes : undefined,
          pagesRouter: pageRoutes.length > 0 ? pageRoutes : undefined,
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(output, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    }
  )
}
