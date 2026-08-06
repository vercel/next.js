import type { ServerResponse, IncomingMessage } from 'http'
import {
  createMcpServer,
  type McpServerOptions,
} from './get-or-create-mcp-server'
import { parseBody } from '../api-utils/node/parse-body'
import { StreamableHTTPServerTransport } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp'

export function getMcpMiddleware(options: McpServerOptions) {
  // Each middleware closure belongs to one dev server/project.
  let mcpServer: ReturnType<typeof createMcpServer> | undefined

  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(req.url || '', 'http://n')
    if (!pathname.startsWith('/_next/mcp')) {
      return next()
    }
    mcpServer ??= createMcpServer(options)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    try {
      res.on('close', () => {
        transport.close()
      })
      await mcpServer.connect(transport)
      const parsedBody = await parseBody(req, 1024 * 1024) // 1MB limit
      await transport.handleRequest(req, res, parsedBody)
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Internal server error' },
            id: null,
          })
        )
      }
    }
  }
}
