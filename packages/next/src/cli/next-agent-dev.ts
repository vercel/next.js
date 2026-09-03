import fs from 'fs'
import path from 'path'
import type { DevServerInfo } from '../build/lockfile'
import { getProjectDir } from '../lib/get-project-dir'
import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import { bold, cyan } from '../lib/picocolors'
import {
  isPidAlive,
  printDetachedReport,
  printReuseRunningServer,
  readDevServerInfo,
  spawnDetachedDevServer,
  DetachedDevServerError,
} from './next-dev-agent-daemon'

/**
 * `next experimental-agent-dev` — the AI-agent interface to the dev server.
 *
 * One namespace for the whole lifecycle plus querying, agent-browser style:
 *
 *   next experimental-agent-dev              server info + available tools
 *   next experimental-agent-dev start        start the dev server, detached
 *   next experimental-agent-dev stop         stop the running server
 *   next experimental-agent-dev status       is a server running for this cwd?
 *   next experimental-agent-dev log [-f]     the server's terminal output
 *   next experimental-agent-dev <tool> [key=value ...]   call an MCP tool
 *
 * The server is discovered from the dev lockfile, cwd-relative like
 * `next dev` (`--url` targets a specific server). Tool calls auto-start a
 * detached server when none is running, so "query the app" never needs a
 * separate "is it up?" step.
 */

export type NextAgentDevOptions = {
  url?: string
  args?: string
  json?: boolean
  port?: number
  lines?: number
  follow?: boolean
}

const DISCOVERY_TIMEOUT_MS = 1000
const DISCOVERY_RETRY_MS = 50
const STOP_TIMEOUT_MS = 8000

const JSONRPC_VERSION = '2.0'
const MCP_PROTOCOL_VERSION = '2025-03-26'

const LIFECYCLE_COMMANDS = new Set(['start', 'stop', 'status', 'log', 'logs'])

export async function nextAgentDev(
  command: string | undefined,
  toolArgs: string[],
  options: NextAgentDevOptions,
  directory?: string
): Promise<void> {
  if (command !== undefined && LIFECYCLE_COMMANDS.has(command)) {
    const project = await resolveProject(directory)
    switch (command) {
      case 'start':
        return startVerb(project, options)
      case 'stop':
        return stopVerb(project)
      case 'status':
        return statusVerb(project)
      case 'log':
      case 'logs':
        return logVerb(project, options)
    }
  }

  const devServerUrl = options.url
    ? parseDevServerUrl(options.url)
    : await discoverOrStartDevServer(directory)

  const client = new McpHttpClient(new URL('/_next/mcp', devServerUrl))

  if (!command) {
    await printServerOverview(devServerUrl, client, options)
    return
  }

  // Accept `get-errors` for `get_errors`.
  const toolName = command.replace(/-/g, '_')
  const args = options.args
    ? parseJsonArgs(options.args)
    : parseKeyValueArgs(toolArgs)

  const response = await client.request('tools/call', {
    name: toolName,
    arguments: args,
  })
  await printToolResult(toolName, response, options, client)
}

interface ProjectRef {
  dir: string
  /** Phase-resolved relative distDir (e.g. `.next/dev`). */
  distDir: string
  lockfilePath: string
}

async function resolveProject(directory?: string): Promise<ProjectRef> {
  const dir = getProjectDir(directory)
  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)
  return {
    dir,
    distDir: config.distDir,
    lockfilePath: path.join(dir, config.distDir, 'lock'),
  }
}

function liveServerInfo(project: ProjectRef): DevServerInfo | undefined {
  const info = readDevServerInfo(project.lockfilePath)
  return info && isPidAlive(info.pid) ? info : undefined
}

async function startVerb(
  project: ProjectRef,
  options: NextAgentDevOptions
): Promise<void> {
  const existing = liveServerInfo(project)
  if (existing) {
    printReuseRunningServer(existing)
    process.exitCode = 1
    return
  }
  const devArgs = options.port != null ? ['--port', String(options.port)] : []
  try {
    const info = await spawnDetachedDevServer(
      project.dir,
      project.distDir,
      devArgs
    )
    printDetachedReport(info, project.dir, project.distDir)
  } catch (error) {
    if (error instanceof DetachedDevServerError) {
      printAndExit(error.message, 1)
    }
    throw error
  }
}

async function stopVerb(project: ProjectRef): Promise<void> {
  const info = liveServerInfo(project)
  if (!info) {
    console.log(`No running dev server for this project. Nothing to stop.`)
    return
  }
  try {
    process.kill(info.pid)
  } catch {}
  const deadline = Date.now() + STOP_TIMEOUT_MS
  while (Date.now() < deadline && isPidAlive(info.pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (isPidAlive(info.pid)) {
    try {
      process.kill(info.pid, 'SIGKILL')
    } catch {}
  }
  console.log(
    `Stopped the dev server at ${cyan(info.appUrl)} (PID ${info.pid}).`
  )
}

async function statusVerb(project: ProjectRef): Promise<void> {
  const info = liveServerInfo(project)
  if (!info) {
    console.log(`Not running. No live dev server for ${project.dir}.`)
    console.log(
      `Start one: ${cyan('npx next experimental-agent-dev start')} (or ${cyan('next dev')})`
    )
    process.exitCode = 1
    return
  }
  console.log(bold('Running'))
  console.log(`- URL:      ${cyan(info.appUrl)}`)
  console.log(`- Project:  ${project.dir}`)
  console.log(`- PID:      ${info.pid}`)
  console.log(`- Uptime:   ${formatUptime(Date.now() - info.startedAt)}`)
  const index = await fetchAgentIndex(parseDevServerUrl(info.appUrl))
  if (index) {
    console.log(`- Bundler:  ${index.bundler}`)
    console.log(`- Browsers: ${index.activeBrowserConnections} connected`)
  }
  console.log(
    `Tools: ${cyan('npx next experimental-agent-dev')} · Logs: ${cyan('npx next experimental-agent-dev log')}`
  )
}

async function logVerb(
  project: ProjectRef,
  options: NextAgentDevOptions
): Promise<void> {
  const logsDir = path.join(project.dir, project.distDir, 'logs')
  const candidates = ['agent-daemon.log', 'next-development.log']
    .map((name) => path.join(logsDir, name))
    .filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  const logPath = candidates[0]
  if (!logPath) {
    printAndExit(
      `No dev server logs found in ${logsDir}. Start a server first: npx next experimental-agent-dev start`,
      1
    )
    return
  }

  const lines = options.lines ?? 50
  const content = fs.readFileSync(logPath, 'utf-8')
  const tail = content
    .split('\n')
    .slice(-lines - 1)
    .join('\n')
  console.log(`==> ${path.relative(project.dir, logPath)} <==`)
  console.log(tail)

  if (options.follow) {
    let offset = Buffer.byteLength(content)
    setInterval(() => {
      try {
        const size = fs.statSync(logPath).size
        if (size > offset) {
          const fd = fs.openSync(logPath, 'r')
          const buf = Buffer.alloc(size - offset)
          fs.readSync(fd, buf, 0, buf.length, offset)
          fs.closeSync(fd)
          offset = size
          process.stdout.write(buf.toString('utf-8'))
        } else if (size < offset) {
          // Rotated/truncated: start over from the beginning.
          offset = 0
        }
      } catch {}
    }, 500)
    // Keep the process alive until the user interrupts.
    await new Promise(() => {})
  }
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * Discover the running dev server via the lockfile; when none is running,
 * start one detached (agent-browser style: querying never needs a separate
 * "is it up?" step) and continue against it.
 */
async function discoverOrStartDevServer(directory?: string): Promise<URL> {
  const project = await resolveProject(directory)

  const deadline = Date.now() + DISCOVERY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const info = liveServerInfo(project)
    if (info && typeof info.appUrl === 'string') {
      return parseDevServerUrl(info.appUrl)
    }
    await new Promise((resolve) => setTimeout(resolve, DISCOVERY_RETRY_MS))
  }

  console.error(
    `No dev server was running for this project — starting one in the background...`
  )
  try {
    const info = await spawnDetachedDevServer(project.dir, project.distDir, [])
    console.error(
      `Started ${cyan(info.appUrl)} (PID ${info.pid}). Stop it with: ${cyan('npx next experimental-agent-dev stop')}`
    )
    return parseDevServerUrl(info.appUrl)
  } catch (error) {
    if (error instanceof DetachedDevServerError) {
      printAndExit(error.message, 1)
    }
    throw error
  }
}

async function printServerOverview(
  devServerUrl: URL,
  client: McpHttpClient,
  options: NextAgentDevOptions
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
      ` (run with: ${cyan('next experimental-agent-dev <tool> [key=value ...]')})`
  )
  for (const t of tools) {
    const summary = (t.description ?? '').split(/(?<=\.)\s/)[0] ?? ''
    console.log(
      `  ${cyan(t.name.padEnd(24))} ${summary.length > 100 ? summary.slice(0, 97) + '...' : summary}`
    )
  }
  console.log()
  console.log(
    `Lifecycle: ${cyan('start')} · ${cyan('stop')} · ${cyan('status')} · ${cyan('log')} — details: ${cyan('next experimental-agent-dev --help')}`
  )
}

async function printToolResult(
  toolName: string,
  response: any,
  options: NextAgentDevOptions,
  client: McpHttpClient
): Promise<void> {
  if (options.json) {
    console.log(JSON.stringify(response, null, 2))
    return
  }
  if (response?.error) {
    console.error(
      `MCP error from ${toolName}: ${response.error.message ?? JSON.stringify(response.error)}`
    )
    await printToolUsageHint(toolName, client)
    process.exit(1)
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
    // Tool-level errors are usually bad arguments; print the tool's schema
    // so the retry doesn't have to guess.
    await printToolUsageHint(toolName, client)
    process.exitCode = 1
  }
}

/**
 * After a failed call, show the tool's expected arguments (from its MCP
 * inputSchema) — or, for an unknown tool name, the list of valid names.
 */
async function printToolUsageHint(
  toolName: string,
  client: McpHttpClient
): Promise<void> {
  try {
    const response = await client.request('tools/list', {})
    const tools: { name: string; description?: string; inputSchema?: any }[] =
      response?.result?.tools ?? []
    const tool = tools.find((t) => t.name === toolName)
    if (!tool) {
      console.error(
        `\nUnknown tool '${toolName}'. Available tools: ${tools.map((t) => t.name).join(', ')}. Lifecycle commands: start, stop, status, log.`
      )
      return
    }
    const props = tool.inputSchema?.properties ?? {}
    const names = Object.keys(props)
    if (names.length === 0) {
      console.error(`\n'${toolName}' takes no arguments.`)
      return
    }
    const required: string[] = tool.inputSchema?.required ?? []
    console.error(`\nArguments for '${toolName}' (pass as key=value):`)
    for (const name of names) {
      const prop = props[name] ?? {}
      const flag = required.includes(name) ? 'required' : 'optional'
      const desc =
        typeof prop.description === 'string'
          ? ` — ${prop.description.split(/(?<=\.)\s/)[0]}`
          : ''
      console.error(`  ${name} (${prop.type ?? 'any'}, ${flag})${desc}`)
    }
  } catch {
    // The hint is best-effort; the original error is already printed.
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
        clientInfo: { name: 'next-agent-dev-cli', version: '0.1.0' },
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
        `Tool arguments must be key=value pairs (received "${pair}"). Example: next experimental-agent-dev compile_route path=/blog`,
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
