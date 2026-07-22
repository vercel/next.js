import path from 'path'
import { readLockfileContent, parseDevServerInfo } from '../../build/lockfile'
import { getProjectDir } from '../../lib/get-project-dir'
import loadConfig from '../../server/config'
import { printAndExit } from '../../server/lib/utils'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'

const TURBOPACK_MEMORY_DEV_ENDPOINT = '/__nextjs_turbopack-memory'
const DEV_SERVER_DISCOVERY_TIMEOUT_MS = 1000
const DEV_SERVER_DISCOVERY_RETRY_MS = 50

export type NextTurbopackMemoryOptions = {
  format?: string
  url?: string
}

/**
 * Fetches a Turbopack memory report from a running `next dev` server and prints
 * it to stdout. The server is discovered from the `.next` lock file, or a URL
 * can be passed explicitly with `--url`.
 */
export async function nextTurbopackMemory(
  options: NextTurbopackMemoryOptions,
  directory?: string
) {
  const format = options.format ?? 'json'

  const devServerUrl = options.url
    ? parseDevServerUrl(options.url)
    : await discoverDevServerUrl(directory)

  const endpoint = new URL(TURBOPACK_MEMORY_DEV_ENDPOINT, devServerUrl)
  endpoint.searchParams.set('format', format)

  let response
  try {
    response = await fetch(endpoint)
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      printAndExit(
        `Dev server returned ${response.status} for ${endpoint.toString()}: ${text}`,
        1
      )
    }
    const body = await response.text()
    process.stdout.write(body)
    if (!body.endsWith('\n')) {
      process.stdout.write('\n')
    }
  } catch (error) {
    printAndExit(
      `Failed to fetch ${endpoint.toString()}: ${
        error instanceof Error ? error.message : String(error)
      }\n\nMake sure the dev server is still running.`,
      1
    )
  }
}

async function discoverDevServerUrl(directory?: string): Promise<URL> {
  const projectDir = getProjectDir(directory)
  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, projectDir)
  const lockfilePath = path.join(projectDir, config.distDir, 'lock')
  const deadline = Date.now() + DEV_SERVER_DISCOVERY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const lockfileContent = readLockfileContent(lockfilePath)
    const serverInfo = lockfileContent
      ? parseDevServerInfo(lockfileContent)
      : undefined

    if (serverInfo && typeof serverInfo.appUrl === 'string') {
      return parseDevServerUrl(serverInfo.appUrl)
    }

    await new Promise((resolve) =>
      setTimeout(resolve, DEV_SERVER_DISCOVERY_RETRY_MS)
    )
  }

  return exitWithError(
    `Unable to discover a running Next.js dev server from ${lockfilePath}. Start next dev or pass --url.`
  )
}

function exitWithError(message: string): never {
  return printAndExit(message, 1) as never
}

function parseDevServerUrl(value: string): URL {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return exitWithError(
      `Invalid dev server URL "${value}". Pass a valid HTTP or HTTPS URL.`
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return exitWithError(
      `Invalid dev server URL "${value}". Pass a valid HTTP or HTTPS URL.`
    )
  }

  return url
}
