const { Worker } = require('node:worker_threads')
const path = require('path')

// Both requests are only known at runtime, so every file in `lib/` is a
// candidate, including the declaration files next to the JavaScript.
const requireFromLib = (name) => require(`./lib/${name}`)
const startWorker = (name) => new Worker(path.join(__dirname, 'lib', name))

it('should start a worker whose path is only known at runtime', async () => {
  const worker = startWorker('worker.js')

  try {
    const message = await new Promise((resolve, reject) => {
      worker.on('message', resolve)
      worker.on('error', reject)
    })

    expect(message).toBe('ready')
  } finally {
    await worker.terminate()
  }
})

it('should require a JavaScript file matched by a dynamic request', () => {
  expect(requireFromLib('index.js')).toBe('lib')
})

it('should not include declaration files matched by a dynamic request', () => {
  expect(() => requireFromLib('index.d.ts')).toThrow()
  expect(() => requireFromLib('index.d.cts')).toThrow()
  expect(() => requireFromLib('index.d.mts')).toThrow()
})
