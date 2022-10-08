import { Command } from 'commander'
import console from 'console'

import chalk from 'chalk'

import PQueue from 'p-queue'
import { generateProjects, cleanupProjectFolders } from './project-utils.js'
import { printBenchmarkResults } from './chart.js'
import { genRetryableRequest } from './gen-request.js'

const program = new Command()

const queue = new PQueue({ concurrency: 25 })
const TTFB_OUTLIERS_THRESHOLD = 250

program.option('-p, --path <path>')

program.parse(process.argv)

const options = program.opts()

if (options.path) {
  console.log('Running benchmark for path: ', options.path)
}

try {
  const [originDeploymentURL, headDeploymentURL] = await generateProjects()

  const originBenchmarkURL = `${originDeploymentURL}${options.path || ''}`
  const headBenchmarkURL = `${headDeploymentURL}${options.path || ''}`

  console.log(`Origin deployment URL: ${originBenchmarkURL}`)
  console.log(`Head deployment URL: ${headBenchmarkURL}`)
  console.log(`Running benchmark...`)

  const benchResults = await runBenchmark(originBenchmarkURL)

  const headBenchResults = await runBenchmark(headBenchmarkURL)

  console.log(chalk.bold('Benchmark results for cold:'))
  printBenchmarkResults(
    {
      origin: benchResults,
      head: headBenchResults,
    },
    (r) => r.cold && r.firstByte <= TTFB_OUTLIERS_THRESHOLD && r.firstByte
  )
  console.log(chalk.bold('Benchmark results for hot:'))
  printBenchmarkResults(
    {
      origin: benchResults,
      head: headBenchResults,
    },
    (r) => !r.cold && r.firstByte <= TTFB_OUTLIERS_THRESHOLD && r.firstByte
  )
} catch (err) {
  console.log(chalk.red('Benchmark failed: ', err))
} finally {
  await cleanupProjectFolders()
}

async function runBenchmark(url) {
  return (
    await Promise.all(
      Array.from({ length: 500 }).map(() =>
        queue.add(() => genRetryableRequest(url))
      )
    )
  ).filter(Boolean)
}
