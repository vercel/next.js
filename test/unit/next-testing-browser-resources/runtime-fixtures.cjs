const { createModuleReplacer } = require('./module-fixtures.cjs')

function createRuntimeFile(overrides) {
  return {
    enableBrowserPublicTaskQueues() {},
    collect: async (load) => load(),
    validateBrowserClient: () => [],
    getSnapshotSummary: () => ({}),
    ...overrides,
  }
}

function installClientRuntime({ file, browserContext, initializeTestFile }) {
  const runtimePath = require.resolve(
    'next/dist/experimental/testing/client/runtime'
  )
  const replace = createModuleReplacer(runtimePath)
  replace('../runner', {
    getConsoleTask: () => undefined,
    getCurrentConsoleTask: () => undefined,
    initializeTestFile: initializeTestFile ?? (() => file),
  })
  replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
  replace('./source-maps', {
    createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
  })
  replace('./browser-context', browserContext)
  return runtimePath
}

function createRuntimeConfig(id, filePath) {
  return {
    version: 1,
    ownerToken: id,
    authorization: id,
    sourceHash: 'a'.repeat(64),
    rpcURL: 'http://unit/rpc',
    runId: id,
    entryId: id,
    revision: id,
    filePath,
    sourceMaps: [],
  }
}

function installRuntimeEnvironment(config, messages, originalConsole) {
  globalThis.location = { href: 'http://unit/' }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.fetch = async (_url, request) => {
    if (!request?.method) return { ok: true, json: async () => config }
    messages.push(JSON.parse(request.body))
    return { ok: true, json: async () => ({ value: null }) }
  }
  globalThis.console = { ...originalConsole, debug() {} }
}

module.exports = {
  createRuntimeFile,
  installClientRuntime,
  createRuntimeConfig,
  installRuntimeEnvironment,
}
