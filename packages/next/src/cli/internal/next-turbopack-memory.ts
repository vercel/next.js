import path from 'path'
import { bold, cyan, red } from '../../lib/picocolors'
import { readLockfileContent, parseDevServerInfo } from '../../build/lockfile'

export type NextTurbopackMemoryOptions = {
  format?: string
  topN?: number
}

export async function nextTurbopackMemory(
  options: NextTurbopackMemoryOptions,
  directory?: string
) {
  const dir = directory ? path.resolve(directory) : process.cwd()
  const format = options.format ?? 'json'

  // Discover the running dev server from the lock file
  const lockfilePath = path.join(dir, '.next', 'lock')
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

  // Fetch the memory report from the running dev server
  const url = new URL(
    '/__nextjs_turbopack_memory',
    `http://localhost:${serverInfo.port}`
  )
  url.searchParams.set('format', format)
  if (options.topN != null) {
    url.searchParams.set('top_n', String(options.topN))
  }

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
        ` Failed to connect to dev server on port ${serverInfo.port}: ${err.message}\n\n` +
        `Make sure the dev server is still running.`
    )
    process.exit(1)
  }
}
