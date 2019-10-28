import { join } from 'path'
import minify from './minify'
import { promisify } from 'util'
import Worker from 'jest-worker'
import { writeFile, readFile } from 'fs'
import mkdirp from 'mkdirp'

const worker = require.resolve('./minify')
const writeFileP = promisify(writeFile)
const readFileP = promisify(readFile)

export default class TaskRunner {
  constructor({ distDir, cpus, cache }) {
    if (cache) {
      mkdirp.sync((this.cacheDir = join(distDir, 'cache', 'next-minifier')))
    }
    // In some cases cpus() returns undefined
    // https://github.com/nodejs/node/issues/19022
    this.maxConcurrentWorkers = cpus
  }

  run(tasks, callback) {
    /* istanbul ignore if */
    if (!tasks.length) {
      callback(null, [])
      return
    }

    if (this.maxConcurrentWorkers > 1) {
      this.workers = new Worker(worker, {
        enableWorkerThreads: true,
        numWorkers: this.maxConcurrentWorkers,
      })
      this.boundWorkers = options => this.workers.default(options)
    } else {
      this.boundWorkers = async options => minify(options)
    }

    let toRun = tasks.length
    const results = []
    const step = (index, data) => {
      toRun -= 1
      results[index] = data

      if (!toRun) {
        callback(null, results)
      }
    }

    tasks.forEach((task, index) => {
      const cachePath = this.cacheDir && join(this.cacheDir, task.cacheKey)
      const enqueue = async () => {
        try {
          const result = await this.boundWorkers(task)
          const done = () => step(index, result)
          if (cachePath) {
            writeFileP(cachePath, JSON.stringify(result), 'utf8')
              .then(done)
              .catch(done)
          }
        } catch (error) {
          step(index, { error })
        }
      }

      if (this.cacheDir) {
        readFileP(cachePath, 'utf8')
          .then(data => step(index, JSON.parse(data)))
          .catch(() => enqueue())
      } else {
        enqueue()
      }
    })
  }

  exit() {
    if (this.workers) {
      this.workers.end()
    }
  }
}
