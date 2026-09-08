const { fork } = require('child_process')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { copyCache } = require('./swc-cache')

const wasmCache = path.join(__dirname, '../.swc')

class SwcPool {
  constructor(size = Math.min(4, os.availableParallelism())) {
    this.workers = []
    this.next = 0
    this.size = size
  }

  async transform(input) {
    // Each process has a private WASI /cwd. The error-code plugin's files are
    // returned as artifacts, so cached transforms can replay them exactly.
    const index = this.next++ % this.size
    if (!this.workers[index]) this.workers[index] = this.createWorker()
    const worker = await this.workers[index]
    const result = worker.pending.then(
      () =>
        new Promise((resolve, reject) => {
          if (!worker.child.connected)
            return reject(new Error('SWC worker exited'))
          const onExit = (code, signal) => {
            cleanup()
            reject(new Error(`SWC worker exited: ${signal || code}`))
          }
          const onMessage = (message) => {
            worker.cacheReady = !message.error
            cleanup()
            if (message.error) reject(new Error(message.error))
            else resolve(message.value)
          }
          const cleanup = () => {
            worker.child.removeListener('exit', onExit)
            worker.child.removeListener('message', onMessage)
          }
          worker.child.once('exit', onExit)
          worker.child.once('message', onMessage)
          worker.cacheReady = false
          // A worker executes serially, so shared inputs only need to cross
          // IPC when they change. Never resend the error table for each file.
          const message = {
            files: input.files || [input.file],
            options: input.options,
          }
          if (worker.errors !== input.errors) {
            message.errors = input.errors
            worker.errors = input.errors
          }
          worker.child.send(message, (error) => {
            if (error) {
              cleanup()
              reject(error)
            }
          })
        })
    )
    worker.pending = result.catch(() => {})
    return result
  }

  async createWorker() {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'next-taskr-swc-'))
    const privateCache = path.join(cwd, '.swc')
    await copyCache(wasmCache, privateCache).catch(() =>
      fs.rm(privateCache, { recursive: true, force: true })
    )
    const child = fork(path.join(__dirname, 'swc-worker.js'), [], {
      cwd,
      stdio: ['ignore', 2, 2, 'ipc'],
    })
    return { child, cwd, pending: Promise.resolve(), cacheReady: false }
  }

  async close() {
    await Promise.all(
      this.workers.map(async (promise) => {
        const worker = await promise
        const cacheReady = worker.cacheReady
        if (
          worker.child.exitCode === null &&
          worker.child.signalCode === null
        ) {
          await new Promise((resolve) => {
            worker.child.once('exit', resolve)
            worker.child.kill()
          })
        }
        if (cacheReady) {
          // Cache publication is optional; failure must not fail a valid build.
          await copyCache(path.join(worker.cwd, '.swc'), wasmCache, true).catch(
            () => {}
          )
        }
        await fs.rm(worker.cwd, { recursive: true, force: true })
      })
    )
  }
}

module.exports = { SwcPool }
