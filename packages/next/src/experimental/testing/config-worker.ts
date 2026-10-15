import Module, { register } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

async function send(message: object) {
  return new Promise<void>((resolve, reject) =>
    process.send!(message, (error: Error | null) =>
      error ? reject(error) : resolve()
    )
  )
}
let queue = Promise.resolve()
const teardowns: (() => unknown)[] = []
let setupStarted = false
let rootSetupStarted = false
async function shutdown() {
  const errors: unknown[] = []
  for (const teardown of teardowns.splice(0).reverse()) {
    try {
      await teardown()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length)
    throw new AggregateError(errors, 'Global setup teardown failed.')
}
process.on('message', (message: any) => {
  queue = queue.then(() => handle(message))
})
async function handle(message: any) {
  try {
    if (message?.type === 'teardown') {
      await shutdown()
      await send({ type: 'test-config-result' })
      return
    }
    if (message?.type === 'shutdown' || message?.type === 'cancel') {
      await shutdown()
      if (message.type === 'shutdown')
        await send({ type: 'test-config-result' })
      process.exit(message.type === 'cancel' ? 1 : 0)
      return
    }
    if (message?.type === 'setup' || message?.type === 'setup-root') {
      if (message.type === 'setup-root') {
        if (rootSetupStarted)
          throw new Error('Root global setup has already run.')
        rootSetupStarted = true
      } else {
        if (setupStarted) throw new Error('Global setup has already run.')
        setupStarted = true
      }
      const contexts = Object.create(null)
      for (const project of message.projects) {
        const context: Record<string, unknown> = { ...project.provide }
        const provide = (key: string, value: unknown) => {
          if (typeof key !== 'string')
            throw new TypeError('Provided context keys must be strings.')
          try {
            structuredClone(value)
          } catch {
            throw new TypeError(
              `Provided context value for ${key} must be serializable.`
            )
          }
          Object.defineProperty(context, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        }
        const host = {
          name: project.name,
          config: project,
          provide,
          getProvidedContext: () => ({
            ...project.inheritedProvide,
            ...context,
          }),
        }
        for (const filename of project.globalSetup) {
          const imported = await import(
            pathToFileURL(path.resolve(filename)).href
          )
          const module =
            imported.default && typeof imported.default === 'object'
              ? imported.default
              : imported
          for (const name of ['default', 'setup', 'teardown']) {
            if (
              module[name] !== undefined &&
              typeof module[name] !== 'function'
            )
              throw new TypeError(
                `Global setup ${name} export must be a function.`
              )
          }
          if (module.default) {
            const cleanup = await module.default(host)
            if (cleanup !== undefined && typeof cleanup !== 'function')
              throw new TypeError(
                'Global setup default must return a function or undefined.'
              )
            if (cleanup) teardowns.push(cleanup)
          } else {
            if (!module.setup && !module.teardown)
              throw new Error(
                'Global setup must export default, setup, or teardown.'
              )
            await module.setup?.(host)
            if (module.teardown) teardowns.push(module.teardown)
          }
        }
        contexts[project.name] = context
      }
      await send({ type: 'test-config-result', value: contexts })
      return
    }
    if (message?.type !== 'run')
      throw new Error('Invalid configuration request.')
    const { file, persistent } = message.input
    // These hooks exist only in the owned configuration realm.
    // Node's async ESM hooks do not intercept ordinary CommonJS require calls.
    const nodeModule = Module as unknown as {
      _resolveFilename: (...args: any[]) => string
    }
    const originalResolve = nodeModule._resolveFilename
    nodeModule._resolveFilename = function (
      specifier: string,
      ...args: unknown[]
    ) {
      if (specifier === 'vitest/config' || specifier === 'vite')
        return require.resolve('./config-api')
      if (
        specifier === 'vitest' ||
        specifier.startsWith('vitest/') ||
        specifier.startsWith('vite/')
      )
        throw new Error(
          `Test configuration cannot load the ${specifier} runner/controller. Use the inert vitest/config adapter.`
        )
      return originalResolve.call(this, specifier, ...args)
    }
    const swc = require('../../build/swc') as typeof import('../../build/swc')
    await swc.loadBindings()
    for (const extension of [
      '.ts',
      '.cts',
      '.mts',
      '.cjs',
      '.mjs',
      '.tsx',
      '.jsx',
    ]) {
      require.extensions[extension] = (mod: any, filename: string) => {
        const source = readFileSync(filename, 'utf8')
        const syntax = /\.(?:[cm]?ts|tsx)$/.test(filename)
          ? 'typescript'
          : 'ecmascript'
        const result = swc.transformSync(source, {
          filename,
          sourceMaps: 'inline',
          jsc: {
            target: 'es2022',
            parser: {
              syntax,
              tsx: filename.endsWith('.tsx'),
              jsx: filename.endsWith('.jsx'),
            },
          },
          module: { type: 'commonjs', ignoreDynamic: true },
        })
        mod._compile(result.code, filename)
      }
    }
    const loader = pathToFileURL(require.resolve('./config-loader')).href
    const shim = `import hooks from ${JSON.stringify(loader)};export const initialize=hooks.initialize,resolve=hooks.resolve,load=hooks.load;`
    register(
      `data:text/javascript,${encodeURIComponent(shim)}`,
      pathToFileURL(__filename).href,
      {
        parentURL: pathToFileURL(__filename).href,
        data: { entry: file, apiPath: require.resolve('./config-api') },
      }
    )
    const imported = file
      ? await import(pathToFileURL(file).href)
      : { default: {} }
    const exported = imported.default ?? imported
    const value = await (typeof exported === 'function'
      ? exported({
          command: 'serve',
          mode: 'test',
          isSsrBuild: false,
          isPreview: false,
        })
      : exported)
    await send({ type: 'test-config-loaded', value })
    if (!persistent) process.exit(0)
  } catch (error) {
    let value = error instanceof Error ? error : new Error(String(error))
    try {
      await shutdown()
    } catch (cleanupError) {
      value = new AggregateError(
        [value, cleanupError],
        `${value.message}; global setup teardown failed.`
      )
    }
    await send({
      type: 'test-config-failed',
      error: { name: value.name, message: value.message, stack: value.stack },
    }).catch(() => {})
    process.exit(1)
  }
}
