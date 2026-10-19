const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { resolveTestWatchOptions } = require(process.argv[2])
const { watchTestFiles } = require(process.argv[3])
const mode = process.argv[4]
assert.ok(mode === 'development' || mode === 'production')

async function run() {
  const root = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'next-watch-output-root-')
  )
  const actualWatch = fs.watch
  const listeners = []
  const subscriptions = []
  let watcher
  const errors = []
  let observed
  try {
    await fsp.writeFile(
      path.join(root, 'package.json'),
      '{"private":true,"type":"module"}'
    )
    await fsp.writeFile(
      path.join(root, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ distDir: 'custom-cache', turbopack: { root } }) +
        '\n'
    )
    const metadata = await resolveTestWatchOptions(root, {
      id: 'watch-output-root',
      environment: 'node',
      mode,
      runtime: 'nodejs',
      bundler: 'turbopack',
    })
    const outputRoot = path.join(root, 'custom-cache')
    const runtimeOutput =
      mode === 'development' ? path.join(outputRoot, 'dev') : outputRoot
    fs.watch = function (_directory, _options, listener) {
      const subscription = new EventEmitter()
      subscription.closed = false
      subscription.close = () => {
        subscription.closed = true
        subscription.emit('close')
      }
      listeners.push(listener)
      subscriptions.push(subscription)
      return subscription
    }
    let onChange
    const change = new Promise((resolve) => {
      onChange = resolve
    })
    watcher = await watchTestFiles({
      directories: metadata.roots,
      outputDirectories: [metadata.outputDir],
      artifactDirectories: [
        {
          parentDirectory: metadata.artifactParentDir,
          basenamePrefixes: metadata.artifactBasenamePrefixes,
        },
      ],
      onChange,
      onError: (error) =>
        errors.push({ name: error.name, message: error.message }),
    })
    // Deliver actual public fs.watch callback shapes to the actual source.
    // The saved native diagnostic independently captured the first parent event.
    assert.equal(typeof listeners[0], 'function')
    listeners[0]('rename', 'custom-cache')
    listeners[0]('change', path.join('custom-cache', 'dev', 'generated.js'))
    listeners[0]('change', path.join('custom-cache-like', 'ordinary.mjs'))
    listeners[0]('rename', 'added.case.mjs')
    listeners[0]('change', null)
    let deadline
    const event = await Promise.race([
      change,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () =>
            reject(
              new Error('Actual watch source did not deliver the input barrier')
            ),
          1000
        )
      }),
    ]).finally(() => clearTimeout(deadline))
    assert.deepEqual(event.removed, [])
    observed = {
      mode,
      configuredOutputRootExcluded: metadata.outputDir === outputRoot,
      actualArtifactParentPreserved:
        metadata.artifactParentDir === path.dirname(runtimeOutput),
      changedRelative: event.changed.map(
        (file) => path.relative(root, file).split(path.sep).join('/') || '.'
      ),
      errors,
    }
  } finally {
    if (watcher) await watcher.close()
    fs.watch = actualWatch
    await fsp.rm(root, { recursive: true, force: true })
  }
  observed.nativeSubscriptionsClosed =
    subscriptions.length === 2 &&
    subscriptions.every((subscription) => subscription.closed)
  console.log(JSON.stringify(observed))
  assert.deepEqual(observed, {
    mode,
    configuredOutputRootExcluded: true,
    actualArtifactParentPreserved: true,
    changedRelative: ['custom-cache-like/ordinary.mjs', 'added.case.mjs', '.'],
    errors: [],
    nativeSubscriptionsClosed: true,
  })
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
