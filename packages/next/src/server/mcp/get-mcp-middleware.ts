import type { ServerResponse, IncomingMessage } from 'http'
import {
  getOrCreateMcpServer,
  type McpServerOptions,
} from './get-or-create-mcp-server'
import * as Log from '../../build/output/log'
import { parseBody } from '../api-utils/node/parse-body'
import { StreamableHTTPServerTransport } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp'

const LOOPBACK_MCP_HOSTS = ['localhost', '127.0.0.1', '[::1]']

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase()

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]'
  )
}

function getHostnameFromHostHeader(hostHeader: string | undefined) {
  if (!hostHeader) return undefined

  try {
    return new URL(`http://${hostHeader}`).hostname
  } catch {
    return undefined
  }
}

export function getMcpAllowedHosts(
  devServerUrl: string | undefined,
  requestHost: string | undefined
): string[] {
  const allowedHosts = new Set(LOOPBACK_MCP_HOSTS)
  let port: string | undefined

  if (devServerUrl) {
    try {
      const parsedUrl = new URL(devServerUrl)
      port = parsedUrl.port

      if (isLoopbackHostname(parsedUrl.hostname)) {
        allowedHosts.add(parsedUrl.host)
      }
    } catch {}
  }

  if (port) {
    for (const host of LOOPBACK_MCP_HOSTS) {
      allowedHosts.add(`${host}:${port}`)
    }
  }

  const requestHostname = getHostnameFromHostHeader(requestHost)
  if (requestHostname && isLoopbackHostname(requestHostname) && requestHost) {
    allowedHosts.add(requestHost)
  }

  return Array.from(allowedHosts)
}

export function getMcpMiddleware(options: McpServerOptions) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(req.url || '', 'http://n')
    if (!pathname.startsWith('/_next/mcp')) {
      return next()
    }
    const mcpServer = getOrCreateMcpServer(options)
    const requestHost = Array.isArray(req.headers.host)
      ? req.headers.host[0]
      : req.headers.host
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: true,
      allowedHosts: getMcpAllowedHosts(options.getDevServerUrl(), requestHost),
    })
    try {
      res.on('close', () => {
        transport.close()
      })
      await mcpServer.connect(transport)
      const parsedBody = await parseBody(req, 1024 * 1024) // 1MB limit
      await transport.handleRequest(req, res, parsedBody)
    } catch (error) {
      Log.error('Failed to handle Next.js MCP request', error)
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
