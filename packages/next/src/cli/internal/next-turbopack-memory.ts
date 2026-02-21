import path from 'path'
import { bold, cyan, red } from '../../lib/picocolors'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'
import loadConfig from '../../server/config'
import { readLockfileContent, parseDevServerInfo } from '../../build/lockfile'

export type NextTurbopackMemoryOptions = {
  format?: string
  server?: string
}

export async function nextTurbopackMemory(
  options: NextTurbopackMemoryOptions,
  directory?: string
) {
  const format = options.format ?? 'json'

  let baseUrl: string
  if (options.server) {
    // Direct connection to a known host:port
    const server = options.server.includes('://')
      ? options.server
      : `http://${options.server}`
    baseUrl = server
  } else {
    // Discover the running dev server from the lock file
    const dir = directory ? path.resolve(directory) : process.cwd()

    let distDir = '.next'
    try {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)
      distDir = config.distDir
    } catch {
      // Fall back to default if config can't be loaded
    }

    const lockfilePath = path.join(dir, distDir, 'lock')
    const lockContent = readLockfileContent(lockfilePath)

    if (!lockContent) {
      console.error(
        red('Error:') +
          ' No running Next.js dev server found.\n' +
          `Expected lock file at ${cyan(lockfilePath)}\n\n` +
          `Start a dev server with ${bold('next dev')} and try again.`
      )
      process.exit(1)
    }

    const serverInfo = parseDevServerInfo(lockContent)

    if (!serverInfo) {
      console.error(
        red('Error:') +
          ' Could not parse dev server info from lock file.\n' +
          `Lock file content: ${lockContent}`
      )
      process.exit(1)
    }

    baseUrl = `http://localhost:${serverInfo.port}`
  }

  const url = new URL('/__nextjs_turbopack-memory', baseUrl)
  url.searchParams.set('format', format)

  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      const text = await res.text()
      console.error(
        red('Error:') + ` Dev server returned ${res.status}: ${text}`
      )
      process.exit(1)
    }
    const body = await res.text()
    process.stdout.write(body)
    // Ensure a trailing newline for terminal output
    if (!body.endsWith('\n')) {
      process.stdout.write('\n')
    }
  } catch (err: any) {
    console.error(
      red('Error:') +
        ` Failed to connect to dev server at ${cyan(baseUrl)}: ${err.message}\n\n` +
        `Make sure the dev server is still running.`
    )
    process.exit(1)
  }
}
