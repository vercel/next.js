// The Node side supplies recipes and byte emitters. Scheduling, tracked input
// reads, transform caching, output writes, and watch invalidation belong to Rust.
const protocolWrite = process.stdout.write.bind(process.stdout)
// stdout is reserved for the protocol. JavaScript compiler logs go to stderr;
// subprocesses must likewise inherit fd 2 for both output streams.
process.stdout.write = process.stderr.write.bind(process.stderr)
const fs = require('fs/promises')
const path = require('path')
const readline = require('readline')
const { createHash } = require('crypto')
const { promisify } = require('util')
const glob = promisify(require('glob'))
const { SwcPool } = require('./swc-pool')
const { serializeFile, loadFiles } = require('./artifacts')

const root = path.resolve(__dirname, '..')
// Track the SWC emitter and its configuration in compiler fingerprints.
// Bundlers load only when a recipe invokes them.
require('./swc')
const recipes = require('./recipes')

let nextCall = 1
const replies = new Map()
const pool = new SwcPool()
const services = []
const transformContexts = new Map()
let fingerprint
let outgoing = Promise.resolve()

function send(message) {
  // A separate prefix lets Rust forward unmodified compiler/subprocess output.
  // Wait for each write to finish before sending another message. Unbounded
  // writes can become an oversized writev and fail with ENOBUFS on Node 20.
  const bytes = '\n__NEXT_TASKR__' + JSON.stringify(message) + '\n'
  const sent = outgoing.then(
    () =>
      new Promise((resolve, reject) => {
        protocolWrite(bytes, (error) => (error ? reject(error) : resolve()))
      })
  )
  outgoing = sent.catch(() => {})
  return sent
}

function request(parent, args) {
  const call = nextCall++
  return new Promise((resolve, reject) => {
    replies.set(call, { resolve, reject })
    send({ request: parent, call, args }).catch((error) => {
      replies.delete(call)
      reject(error)
    })
  })
}

function compilerFingerprint() {
  fingerprint ||= computeCompilerFingerprint()
  return fingerprint
}

async function computeCompilerFingerprint() {
  const hash = createHash('sha256')
  hash.update(
    JSON.stringify({
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      env: Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b)),
    })
  )
  const files = new Set([
    ...Object.keys(require.cache),
    path.join(__dirname, 'swc-worker.js'),
    path.join(root, 'package.json'),
    path.join(root, '../../package.json'),
    path.join(root, '../../pnpm-lock.yaml'),
  ])
  const ordered = [...files].sort()
  for (let start = 0; start < ordered.length; start += 16) {
    const batch = ordered.slice(start, start + 16)
    const contents = await Promise.all(batch.map((file) => fs.readFile(file)))
    for (let index = 0; index < batch.length; index++) {
      hash.update(batch[index])
      hash.update(contents[index])
    }
  }
  return hash.digest('hex')
}

const toArray = (value) =>
  value == null ? [] : Array.isArray(value) ? value.flat(Infinity) : [value]

class Recipe {
  constructor(parent) {
    this.parent = parent
    this._ = { files: [], globs: [] }
    this.pending = Promise.resolve()
  }

  enqueue(action) {
    this.pending = this.pending.then(action)
    return this
  }

  then(resolve, reject) {
    return this.pending.then(() => resolve(), reject)
  }

  source(patterns, options = {}) {
    return this.enqueue(async () => {
      patterns = toArray(patterns)
      const matches = await Promise.all(
        patterns
          .filter((p) => !p.startsWith('!'))
          .map((pattern) =>
            glob(pattern, {
              ...options,
              ignore: [
                ...toArray(options.ignore),
                ...patterns
                  .slice(patterns.indexOf(pattern))
                  .filter((p) => p.startsWith('!'))
                  .map((p) => p.slice(1)),
              ],
            })
          )
      )
      const paths = [...new Set(matches.flat())]
      const stats = await Promise.all(paths.map((file) => fs.stat(file)))
      const artifacts = await request(this.parent, {
        kind: 'read',
        artifacts: true,
        paths: paths
          .filter((_, i) => stats[i].isFile())
          .map((file) => path.resolve(file)),
      })
      let index = 0
      this._.globs = patterns
      this._.files = paths.map((file, i) => {
        const { dir, base } = path.parse(file)
        return {
          dir: path.normalize(dir),
          base,
          ...(stats[i].isFile()
            ? { artifact: artifacts[index++] }
            : { data: null }),
        }
      })
    })
  }

  target(destinations, options = {}) {
    return this.enqueue(async () => {
      const trims = this._.globs
        .map((pattern) => {
          let segments = pattern.split(/[\\/]/)
          const index = segments.findIndex((segment) => segment.includes('*'))
          if (index === -1) segments.pop()
          else segments = segments.slice(0, index)
          return path.normalize(segments.join(path.sep))
        })
        .sort((a, b) => b.length - a.length)
      const files = []
      for (const file of this._.files) {
        if (file.data === null) continue
        for (const target of toArray(destinations)) {
          let directory = file.dir
          for (const trim of trims) directory = directory.replace(trim, target)
          files.push({
            ...serializeFile(file),
            path: path.resolve(directory, file.base),
            mode: options.mode,
          })
        }
      }
      await request(this.parent, { kind: 'write', files })
    })
  }

  swc(...options) {
    return this.enqueue(async () => {
      const identity = await compilerFingerprint()
      const context = { fingerprint: identity, options }
      // The digest covers every shared input, but only the digest accompanies
      // each file through Rust and its persistent transform cache.
      const key = createHash('sha256')
        .update(JSON.stringify(context))
        .digest('hex')
      transformContexts.set(key, context)
      const inputs = []
      // Bound native concurrency and amortize IPC and WASI filesystem setup.
      // A batch's complete files and error artifacts form one cached result.
      for (let start = 0; start < this._.files.length; start += 32) {
        inputs.push({
          context: key,
          files: this._.files.slice(start, start + 32).map(serializeFile),
        })
      }
      const results = await request(this.parent, {
        kind: 'transforms',
        artifacts: true,
        inputs,
      })
      this._.files = results.flatMap((result) => result.files)
      const sideEffects = results.flatMap((result) =>
        result.errors.map((file) => ({
          path: path.join(root, '.errors', file.name),
          artifact: file.artifact,
        }))
      )
      if (sideEffects.length)
        await request(this.parent, { kind: 'write', files: sideEffects })
    })
  }

  transform(implementation, options) {
    return this.enqueue(async () => {
      await loadFiles(this._.files, (args) => request(this.parent, args))
      await Promise.all(
        [...this._.files].map((file) =>
          implementation.call(this, file, options)
        )
      )
    })
  }

  ncc(options) {
    return this.transform(require('./ncc'), options)
  }
  webpack(options) {
    if (!options.watch) return this.transform(require('./webpack'), options)
    return this.enqueue(() => {
      const compiler = require('@rspack/core')(options.config)
      services.push(
        compiler.watch({}, (error, stats) => {
          if (error || stats.hasErrors())
            console.error(error || stats.toString())
          else console.error(`${options.name} compiled successfully.`)
        })
      )
    })
  }

  run(implementation) {
    return this.enqueue(async () => {
      await loadFiles(this._.files, (args) => request(this.parent, args))
      const files = [...this._.files]
      await Promise.all(files.map((file) => implementation.call(this, file)))
    })
  }

  async generateTypes(options) {
    const watch = options.dev
    const child = require('execa')(
      'pnpm',
      ['run', 'types', ...(watch ? ['--watch', '--preserveWatchOutput'] : [])],
      { stdio: ['inherit', 2, 2] }
    )
    if (!watch) {
      await child
      return
    }
    services.push({
      close(callback) {
        child.kill()
        callback()
      },
    })
    child.catch((error) => {
      if (!error.isCanceled && !error.killed) console.error(error.message)
    })
  }

  tasks(names, options, parallel) {
    return this.enqueue(() =>
      request(this.parent, {
        kind: 'tasks',
        names: toArray(names),
        options: options || {},
        parallel,
      })
    )
  }
  start(name, options) {
    return this.tasks([name], options, false)
  }
  serial(names, options) {
    return this.tasks(names, options, false)
  }
  parallel(names, options) {
    return this.tasks(names, options, true)
  }
  clear(directory) {
    return this.enqueue(() =>
      request(this.parent, { kind: 'clear', path: path.resolve(directory) })
    )
  }
  watch(directory, names, options) {
    return this.enqueue(() =>
      request(this.parent, {
        kind: 'watch',
        path: path.resolve(directory),
        names: toArray(names),
        options: options || {},
      })
    )
  }
}

async function execute(message) {
  switch (message.kind) {
    case 'list':
      return Object.keys(recipes).filter(
        (name) => typeof recipes[name] === 'function'
      )
    case 'task': {
      const recipe = recipes[message.args.name]
      if (typeof recipe !== 'function')
        throw new Error(`Unknown task: ${message.args.name}`)
      const context = new Recipe(message.id)
      await recipe(context, { src: null, val: null, ...message.args.options })
      await context.pending
      return null
    }
    case 'transform': {
      const context = transformContexts.get(message.args.context)
      if (!context) throw new Error('Unknown transform context')
      return pool.transform({
        ...message.args,
        ...context,
      })
    }
    case 'shutdown':
      await Promise.all(
        services.map(
          (service) => new Promise((resolve) => service.close(resolve))
        )
      )
      await pool.close()
      return null
    default:
      throw new Error(`Unknown worker operation: ${message.kind}`)
  }
}

readline
  .createInterface({ input: process.stdin })
  .on('line', (line) => {
    const message = JSON.parse(line)
    if (message.reply !== undefined) {
      const pending = replies.get(message.reply)
      replies.delete(message.reply)
      if (message.error) pending.reject(new Error(message.error))
      else pending.resolve(message.value)
    } else {
      execute(message).then(
        (value) => send({ request: message.id, value }),
        (error) =>
          send({ request: message.id, error: error.stack || error.message })
      )
    }
  })
  .on('close', async () => {
    await pool.close()
    process.exit(0)
  })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await pool.close()
    process.exit(0)
  })
}
