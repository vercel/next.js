const { join } = require('path')
const { writeFile, readFile } = require('fs/promises')
const workerThreads = require('worker_threads')
const loaderWorkers = []
const OriginalWorker = workerThreads.Worker
workerThreads.Worker = class extends OriginalWorker {
  constructor(filename, options) {
    super(filename, options)
    if (options?.workerData?.bindingPath) loaderWorkers.push(this)
  }
}
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const { execute } = require('next/dist/experimental/testing/execution/execute')

async function main() {
  const results = []
  for (const id of ['first', 'second']) {
    await writeFile(join(process.cwd(), 'loader-resources.jsonl'), '')
    await writeFile(join(process.cwd(), 'specs/loader.test-data'), id)
    const profile = {
      id,
      environment: 'node',
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    const entry = { id, file: join(process.cwd(), 'specs/loader.ts'), profile }
    const session = await createTestCompilerSession(process.cwd(), profile)
    try {
      const artifact = await session.compile(entry, {
        signal: new AbortController().signal,
      })
      await session.shutdownCompilation()
      const resources = (
        await readFile(join(process.cwd(), 'loader-resources.jsonl'), 'utf8')
      )
        .trim()
        .split('\n')
        .map(JSON.parse)
      if (!resources.length) throw new Error('Loader never executed')
      for (const resource of resources) {
        if (resource.isMainThread) {
          try {
            process.kill(resource.pid, 0)
          } catch (error) {
            if (error.code === 'ESRCH') continue
            throw error
          }
          throw new Error(
            `Loader process ${resource.pid} still alive after shutdown`
          )
        } else if (
          !loaderWorkers.length ||
          loaderWorkers.some((worker) => worker.threadId !== -1)
        ) {
          throw new Error('Loader Worker still alive after shutdown')
        }
      }
      const events = []
      const result = await execute(artifact, {
        runId: id,
        projectDir: process.cwd(),
        entry,
        setupFiles: [],
        testTimeout: 10000,
        hookTimeout: 10000,
        fileTimeout: 30000,
        signal: new AbortController().signal,
        onEvent: (event) => events.push(event),
      })
      results.push({
        status: result.status,
        resourcesClosed: true,
        names: events
          .filter((event) => event.type === 'case-start')
          .map((event) => event.name),
      })
    } finally {
      await session.dispose()
    }
  }
  console.log('NEXT_TEST_CONTEXT_RESULT=' + JSON.stringify(results))
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
