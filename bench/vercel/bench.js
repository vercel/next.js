import { Command } from 'commander'
import console from 'console'

import PQueue from 'p-queue'
import {
  generateProjects,
  cleanupProjectFolders,
  TEST_PROJECT_NAME,
} from './project-utils.js'
import { printBenchmarkResults } from './chart.js'
import { genRetryableRequest } from './gen-request.js'
import { bold, red } from '../../packages/next/dist/lib/picocolors.js'

const program = new Command()

const queue = new PQueue({ concurrency: 50 })
const TTFB_OUTLIERS_THRESHOLD = 1500

let progress = 0

program.option('-p, --path <path>')
program.option('-s, --skip-build', 'Skip build step')
program.option('-f, --force-crash', 'Force function crash')

program.parse(process.argv)

const options = program.opts()

if (options.path) {
  console.log('Running benchmark for path: ', options.path)
}

if (options.skipBuild) {
  console.log('Skipping build step')
}

if (options.forceCrash) {
  console.log('Forcing function crash')
}

export const forceCrash = options.forceCrash

try {
  const [originDeploymentURL, headDeploymentURL] = options.skipBuild
    ? [
        `https://${TEST_PROJECT_NAME}-origin.vercel.app`,
        `https://${TEST_PROJECT_NAME}-head.vercel.app`,
      ]
    : await generateProjects()

  const originBenchmarkURL = `${originDeploymentURL}${options.path || ''}`
  const headBenchmarkURL = `${headDeploymentURL}${options.path || ''}`

  console.log(`Origin deployment URL: ${originBenchmarkURL}`)
  console.log(`Head deployment URL: ${headBenchmarkURL}`)
  console.log(`Running benchmark...`)

  const benchResults = await runBenchmark(originBenchmarkURL)

  const headBenchResults = await runBenchmark(headBenchmarkURL)

  console.log(bold('Benchmark results for cold:'))
  printBenchmarkResults(
    {
      origin: benchResults,
      head: headBenchResults,
    },
    (r) => r.cold && r.firstByte <= TTFB_OUTLIERS_THRESHOLD && r.firstByte
  )
  console.log(bold('Benchmark results for hot:'))
  printBenchmarkResults(
    {
      origin: benchResults,
      head: headBenchResults,
    },
    (r) => !r.cold && r.firstByte <= TTFB_OUTLIERS_THRESHOLD && r.firstByte
  )
} catch (err) {
  console.log(red('Benchmark failed: ', err))
} finally {
  await cleanupProjectFolders()
}

async function runBenchmark(url) {
  progress = 0
  process.stdout.write(`Sending requests to ${url} ...\n`)
  process.stdout.write(`Progress: ${++progress}/500`)
  return (
    await Promise.all(
      Array.from({ length: 500 }).map(async () => {
        const p = await queue.add(() => genRetryableRequest(url))
        refreshProgress()
        return p
      })
    )
  ).filter(Boolean)
}

function refreshProgress() {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(`Requests sent: ${++progress}/500`)
}
