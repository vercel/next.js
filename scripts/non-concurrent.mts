import path from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import { fileURLToPath } from 'url'

/**
 * Make sure that script passed a arguments is not run concurrently.
 * It will wait for other invocations with the same `operation-id` to finish before running.
 *
 * Usage:
 *  node scripts/non-concurrent.mts [operation-id] [script with arguments]...
 * Example:
 *  node scripts/non-concurrent.mts test-pack node scripts/test-pack.mts --more --args
 */

const timeoutMs = 100
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const cleanupFns: (() => void)[] = []

const main = async () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const repoRoot = path.dirname(__dirname)
  const operationId = process.argv[2]
  const nonConcurrentFolder = path.join(
    repoRoot,
    'test',
    'tmp',
    'nonConcurrent'
  )
  const lockFolder = path.join(nonConcurrentFolder, `${operationId}.lock`)

  while (true) {
    // Create a file but throw if it already exists, use fs module
    try {
      await fs.ensureDir(nonConcurrentFolder)
      await fs.mkdir(lockFolder)
      cleanupFns.push(() => fs.rmdirSync(lockFolder, { recursive: true }))
    } catch (err) {
      if (err.code === 'EEXIST') {
        console.log(`Waiting for other invocations to finish...`)
        await sleep(timeoutMs)
        continue
      }
      throw err
    }

    const proc = execa(process.argv[3], process.argv.slice(4))
    proc.stdout?.pipe(process.stdout)
    proc.stderr?.pipe(process.stderr)
    await proc
    return
  }
}

const exitHandler = async () => {
  for (const fn of cleanupFns) {
    try {
      fn()
    } catch (err) {}
  }
  process.exit()
}

process.on('exit', exitHandler)
process.on('SIGINT', exitHandler)
process.on('SIGUSR1', exitHandler)
process.on('SIGUSR2', exitHandler)
process.on('uncaughtException', exitHandler)

main()
