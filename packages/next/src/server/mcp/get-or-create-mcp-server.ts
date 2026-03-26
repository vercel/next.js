import { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { registerGetProjectMetadataTool } from './tools/get-project-metadata'
import { registerGetErrorsTool } from './tools/get-errors'
import { registerGetPageMetadataTool } from './tools/get-page-metadata'
import { registerGetLogsTool } from './tools/get-logs'
import { registerGetActionByIdTool } from './tools/get-server-action-by-id'
import { registerGetRoutesTool } from './tools/get-routes'
import { registerGetCompilationIssuesTool } from './tools/get-compilation-issues'
import type { HmrMessageSentToBrowser } from '../dev/hot-reloader-types'
import type { NextConfigComplete } from '../config-shared'
import type { Entrypoints } from '../../build/swc/types'
import type { EntryKey } from '../../shared/lib/turbopack/entry-key'

export interface McpServerOptions {
  projectPath: string
  distDir: string
  nextConfig: NextConfigComplete
  pagesDir: string | undefined
  appDir: string | undefined
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void
  getActiveConnectionCount: () => number
  getDevServerUrl: () => string | undefined
  getCurrentEntrypoints?: () => Entrypoints
  getWrittenEntrypoints?: () => ReadonlyMap<EntryKey, unknown>
}

let mcpServer: McpServer | undefined

export const getOrCreateMcpServer = (options: McpServerOptions) => {
  if (mcpServer) {
    return mcpServer
  }

  mcpServer = new McpServer({
    name: 'Next.js MCP Server',
    version: '0.2.0',
  })

  registerGetProjectMetadataTool(
    mcpServer,
    options.projectPath,
    options.getDevServerUrl
  )
  registerGetErrorsTool(
    mcpServer,
    options.sendHmrMessage,
    options.getActiveConnectionCount
  )
  registerGetPageMetadataTool(
    mcpServer,
    options.sendHmrMessage,
    options.getActiveConnectionCount
  )
  registerGetLogsTool(mcpServer, options.distDir)
  registerGetActionByIdTool(mcpServer, options.distDir)
  registerGetRoutesTool(mcpServer, {
    projectPath: options.projectPath,
    nextConfig: options.nextConfig,
    pagesDir: options.pagesDir,
    appDir: options.appDir,
  })

  // Turbopack-only: these options provide live access to compiled endpoint
  // state that the webpack dev server does not expose.
  if (options.getCurrentEntrypoints && options.getWrittenEntrypoints) {
    registerGetCompilationIssuesTool(mcpServer, {
      getCurrentEntrypoints: options.getCurrentEntrypoints,
      getWrittenEntrypoints: options.getWrittenEntrypoints,
    })
  }

  return mcpServer
}
