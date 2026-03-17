/**
 * CLI command: next internal apply <patch.diff> --url <url>
 *
 * Applies a unified diff to the project by sending it to the running
 * `next dev` server's /_next/dev/apply endpoint, along with URLs of
 * pages to compile and verify.
 *
 * 1. Reads .next/dev/lock to discover the running dev server
 * 2. Reads the patch file (or stdin)
 * 3. POSTs the diff + URLs to /_next/dev/apply as JSON
 * 4. Prints structured result (compile errors, runtime errors, screenshots)
 * 5. Exits with code 0 (success) or 1 (errors)
 */

import fs from 'fs'
import path from 'path'
import http from 'http'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'
import type { ApplyResponse } from '../server/dev/agentic-apply-middleware'

export interface NextDevApplyOptions {
  patchFile: string
  directory?: string
  format?: 'json' | 'text'
  url?: string[]
}

function makeErrorResponse(message: string): ApplyResponse {
  return {
    success: false,
    affectedFiles: [],
    diffs: [],
    pages: [
      {
        url: '',
        captureDir: '',
        screenshot: '',
        compileErrors: [message],
        runtimeErrors: [],
      },
    ],
    durationMs: 0,
  }
}

export async function nextDevApply(
  options: NextDevApplyOptions
): Promise<void> {
  const projectDir = options.directory || process.cwd()
  const format = options.format || 'json'
  const urls = options.url || []

  // Discover the running dev server
  const lockfilePath = path.join(projectDir, '.next', 'dev', 'lock')
  const lockfileContent = readLockfileContent(lockfilePath)

  if (!lockfileContent) {
    printResult(
      makeErrorResponse(
        'No running dev server found. Start one with `next dev` before calling `next internal apply`.'
      ),
      format
    )
    process.exit(1)
  }

  const serverInfo = parseDevServerInfo(lockfileContent)
  if (!serverInfo) {
    printResult(
      makeErrorResponse('Could not parse dev server info from .next/dev/lock'),
      format
    )
    process.exit(1)
  }

  try {
    process.kill(serverInfo.pid, 0)
  } catch {
    printResult(
      makeErrorResponse(
        `Dev server (PID ${serverInfo.pid}) is no longer running. Start a new one with \`next dev\`.`
      ),
      format
    )
    process.exit(1)
  }

  // Read the patch
  let diffText: string
  if (options.patchFile === '-') {
    diffText = await readStdin()
  } else {
    const patchPath = path.resolve(projectDir, options.patchFile)
    try {
      diffText = fs.readFileSync(patchPath, 'utf-8')
    } catch {
      printResult(
        makeErrorResponse(`Could not read patch file: ${patchPath}`),
        format
      )
      process.exit(1)
    }
  }

  // POST to /_next/dev/apply
  try {
    const result = await postPatch(
      serverInfo.port,
      serverInfo.hostname,
      diffText,
      urls
    )
    printResult(result, format)
    process.exit(result.success ? 0 : 1)
  } catch (e) {
    printResult(
      makeErrorResponse(
        `Failed to connect to dev server at ${serverInfo.appUrl}: ${e instanceof Error ? e.message : String(e)}`
      ),
      format
    )
    process.exit(1)
  }
}

function postPatch(
  port: number,
  hostname: string,
  patchText: string,
  urls: string[]
): Promise<ApplyResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ patch: patchText, urls })
    const postData = Buffer.from(body, 'utf-8')

    const req = http.request(
      {
        hostname: hostname === '0.0.0.0' ? 'localhost' : hostname,
        port,
        path: '/_next/dev/apply',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length,
        },
        timeout: 120_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          try {
            const responseBody = Buffer.concat(chunks).toString('utf-8')
            const result = JSON.parse(responseBody) as ApplyResponse
            resolve(result)
          } catch {
            reject(new Error('Invalid response from dev server'))
          }
        })
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })

    req.write(postData)
    req.end()
  })
}

function printResult(result: ApplyResponse, format: 'json' | 'text'): void {
  if (format === 'json') {
    console.log(JSON.stringify(result))
  } else {
    if (result.success) {
      console.log('Patch applied successfully.')
      if (result.affectedFiles.length > 0) {
        console.log(`Modified files: ${result.affectedFiles.join(', ')}`)
      }
      for (const page of result.pages) {
        if (page.screenshot) {
          console.log(`Screenshot (${page.url}): ${page.screenshot}`)
        }
      }
      console.log(`Duration: ${result.durationMs}ms`)
    } else {
      console.error('Patch failed.')
      for (const page of result.pages) {
        for (const err of page.compileErrors) {
          console.error(`  Compile error: ${err}`)
        }
        for (const err of page.runtimeErrors) {
          console.error(`  Runtime error: ${err}`)
        }
      }
    }
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf-8'))
    )
    process.stdin.on('error', reject)
  })
}
