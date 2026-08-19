import path from 'path'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'
import { getProjectDir } from '../lib/get-project-dir'
import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import { bold, cyan } from '../lib/picocolors'

/**
 * `next devtools [tool] [key=value ...]` — query a running dev server's MCP
 * tools from the shell, without an MCP client.
 *
 * Agents (and humans) verify changes from the command line; hand-rolling MCP
 * JSON-RPC over HTTP with curl is possible but laborious. This command does
 * the discovery (via the dev lockfile, cwd-relative like `next dev`) and the
 * MCP handshake, and prints tool results as JSON.
 */

export type NextDevtoolsOptions = {
  url?: string
  args?: string
  json?: boolean
}

const DISCOVERY_TIMEOUT_MS = 1000
const DISCOVERY_RETRY_MS = 50

const JSONRPC_VERSION = '2.0'
const MCP_PROTOCOL_VERSION = '2025-03-26'

export async function nextDevtools(
  tool: string | undefined,
  toolArgs: string[],
  options: NextDevtoolsOptions,
  directory?: string
): Promise<void> {
  const devServerUrl = options.url
    ? parseDevServerUrl(options.url)
    : await discoverDevServerUrl(directory)

  const client = new McpHttpClient(new URL('/_next/mcp', devServerUrl))

  if (!tool) {
    await printServerOverview(devServerUrl, client, options)
    return
  }

  // Accept `get-errors` for `get_errors`.
  const toolName = tool.replace(/-/g, '_')
  const args = options.args
    ? parseJsonArgs(options.args)
    : parseKeyValueArgs(toolArgs)

  const response = await client.request('tools/call', {
    name: toolName,
    arguments: args,
  })
  printToolResult(toolName, response, options)
}

async function printServerOverview(
  devServerUrl: URL,
  client: McpHttpClient,
  options: NextDevtoolsOptions
): Promise<void> {
  // The agent index carries project identity (useful with several servers);
  // it only exists in agent mode, so treat it as optional.
  const index = await fetchAgentIndex(devServerUrl)
  const response = await client.request('tools/list', {})
  const tools: { name: string; description?: string }[] =
    response?.result?.tools ?? []

  if (options.json) {
    console.log(JSON.stringify({ server: index ?? null, tools }, null, 2))
    return
  }

  console.log(bold('Next.js dev server'))
  console.log(`- URL:      ${cyan(devServerUrl.origin)}`)
  if (index) {
    console.log(`- Project:  ${index.project}`)
    console.log(`- PID:      ${index.pid}`)
    console.log(`- Bundler:  ${index.bundler}`)
  }
  console.log()
  if (tools.length === 0) {
    console.log(
      'No MCP tools reported. Is `experimental.mcpServer` disabled in next.config?'
    )
    return
  }
  console.log(
    bold(`Tools`) +
      ` (run with: ${cyan('next devtools <tool> [key=value ...]')})`
  )
  for (const t of tools) {
    const summary = (t.description ?? '').split(/(?<=\.)\s/)[0] ?? ''
    console.log(
      `  ${cyan(t.name.padEnd(24))} ${summary.length > 100 ? summary.slice(0, 97) + '...' : summary}`
    )
  }
}

function printToolResult(
  toolName: string,
  response: any,
  options: NextDevtoolsOptions
): void {
  if (options.json) {
    console.log(JSON.stringify(response, null, 2))
    return
  }
  if (response?.error) {
    printAndExit(
      `MCP error from ${toolName}: ${response.error.message ?? JSON.stringify(response.error)}`,
      1
    )
  }
  const result = response?.result
  const content: { type: string; text?: string }[] = result?.content ?? []
  for (const item of content) {
    if (item.type === 'text' && typeof item.text === 'string') {
      try {
        console.log(JSON.stringify(JSON.parse(item.text), null, 2))
      } catch {
        console.log(item.text)
      }
    } else {
      console.log(JSON.stringify(item, null, 2))
    }
  }
  if (result?.isError) {
    process.exitCode = 1
  }
}

async function fetchAgentIndex(devServerUrl: URL): Promise<any | undefined> {
  try {
    const res = await fetch(new URL('/_next/agent', devServerUrl))
    if (!res.ok) return undefined
    return await res.json()
  } catch {
    return undefined
  }
}

/**
 * Minimal MCP client over streamable HTTP. The dev server's transport is
 * stateless (no session ids), so each request initializes a fresh logical
 * session: initialize → notifications/initialized → the actual request.
 * Responses may arrive as JSON or as a single-message SSE stream.
 */
class McpHttpClient {
  private endpoint: URL
  private nextId = 1

  constructor(endpoint: URL) {
    this.endpoint = endpoint
  }

  async request(method: string, params: unknown): Promise<any> {
    await this.post({
      jsonrpc: JSONRPC_VERSION,
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'next-devtools-cli', version: '0.1.0' },
      },
    })
    await this.post({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/initialized',
    })
    const id = this.nextId++
    const response = await this.post({
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      params,
    })
    return response
  }

  private async post(body: Record<string, unknown>): Promise<any> {
    let res: Response
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      printAndExit(
        `Failed to reach ${this.endpoint.toString()}: ${error instanceof Error ? error.message : String(error)}`,
        1
      )
      throw error
    }
    const contentType = res.headers.get('content-type') ?? ''
    const text = await res.text()
    // Notifications are acknowledged with a body-less 202.
    if (res.status === 202 || text.length === 0) return undefined
    if (contentType.includes('text/event-stream')) {
      const messages = text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => {
          try {
            return JSON.parse(line.slice('data:'.length).trim())
          } catch {
            return undefined
          }
        })
        .filter(Boolean)
      const id = body.id
      return (
        messages.find((m: any) => id !== undefined && m.id === id) ??
        messages[messages.length - 1]
      )
    }
    try {
      return JSON.parse(text)
    } catch {
      printAndExit(
        `Invalid response from ${this.endpoint.toString()} (status ${res.status}): ${text.slice(0, 300)}`,
        1
      )
    }
  }
}

function parseJsonArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {}
  printAndExit(`--args must be a JSON object, received: ${raw}`, 1)
  throw new Error('unreachable')
}

function parseKeyValueArgs(pairs: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq === -1) {
      printAndExit(
        `Tool arguments must be key=value pairs (received "${pair}"). Example: next devtools compile_route path=/blog`,
        1
      )
    }
    const key = pair.slice(0, eq)
    const raw = pair.slice(eq + 1)
    try {
      args[key] = JSON.parse(raw)
    } catch {
      args[key] = raw
    }
  }
  return args
}

function parseDevServerUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl)
  } catch {
    printAndExit(`Invalid --url: ${rawUrl}`, 1)
    throw new Error('unreachable')
  }
}

async function discoverDevServerUrl(directory?: string): Promise<URL> {
  const projectDir = getProjectDir(directory)
  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, projectDir)
  const lockfilePath = path.join(projectDir, config.distDir, 'lock')
  const deadline = Date.now() + DISCOVERY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const lockfileContent = readLockfileContent(lockfilePath)
    const serverInfo = lockfileContent
      ? parseDevServerInfo(lockfileContent)
      : undefined
    if (serverInfo && typeof serverInfo.appUrl === 'string') {
      return parseDevServerUrl(serverInfo.appUrl)
    }
    await new Promise((resolve) => setTimeout(resolve, DISCOVERY_RETRY_MS))
  }

  printAndExit(
    `No running dev server found for this project (looked for ${lockfilePath}). Start one with \`next dev\`, or target a server directly with --url http://localhost:<port>.`,
    1
  )
  throw new Error('unreachable')
}
