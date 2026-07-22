/**
 * Runs one fake-stack-frame scenario in a bare Node.js process and prints the
 * observations as JSON. Must run with `--enable-source-maps`, like `next dev`
 * runs the server.
 *
 * Everything between the copied React pieces (react-flight-semantics.js) and
 * the real Next.js modules is elided: a "hop" across a Flight boundary is the
 * producer's `emitErrorChunk` followed by the consumer's `resolveErrorDev`,
 * exactly the calls React makes, minus the wire.
 */

/* global AggregateError */

const fs = require('fs')
const os = require('os')
const path = require('path')
const url = require('url')
const util = require('util')
const inspector = require('node:inspector')
const { SourceMap } = require('module')

const R = require('./react-flight-semantics')

// The Next.js server bootstrap exposes this global before any server code
// runs (see packages/next/src/server/node-environment.ts).
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage

const nextDist =
  process.env.NEXT_DIST ?? path.join(__dirname, '../../../packages/next/dist')
const sourceMaps = require(path.join(nextDist, 'server/lib/source-maps'))
const {
  createReactServerErrorHandler,
  createHTMLErrorHandler,
  getDigestForWellKnownError,
  isUserLandError,
} = require(path.join(nextDist, 'server/app-render/create-error-handler'))
const patchErrorInspect = require(
  path.join(nextDist, 'server/patch-error-inspect')
)

// Next.js installs this for the server process; it replaces
// `Error.prepareStackTrace` and the `util.inspect` handling of errors.
patchErrorInspect.patchErrorInspectNodeJS(Error)

// The dev server raises the stack trace limit (see next-dev-server.ts).
Error.stackTraceLimit = 50

// ---------------------------------------------------------------------------
// Fixture: a synthetic chunk with a real source map
// ---------------------------------------------------------------------------

const BASE64_VLQ =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function encodeVLQ(value) {
  let vlq = value < 0 ? (-value << 1) + 1 : value << 1
  let encoded = ''
  do {
    let digit = vlq & 0b11111
    vlq >>>= 5
    if (vlq > 0) digit |= 0b100000
    encoded += BASE64_VLQ[digit]
  } while (vlq > 0)
  return encoded
}

/** @param mappings - `{ genLine, genCol, srcLine, srcCol }[]`, 0-based, sorted */
function encodeMappings(mappings) {
  let out = ''
  let previousGenLine = 0
  let previousGenCol = 0
  let previousSrcLine = 0
  let previousSrcCol = 0
  for (const mapping of mappings) {
    if (previousGenLine < mapping.genLine) {
      while (previousGenLine < mapping.genLine) {
        out += ';'
        previousGenLine++
      }
      previousGenCol = 0
    } else if (out !== '' && !out.endsWith(';')) {
      out += ','
    }
    out +=
      encodeVLQ(mapping.genCol - previousGenCol) +
      encodeVLQ(0) +
      encodeVLQ(mapping.srcLine - previousSrcLine) +
      encodeVLQ(mapping.srcCol - previousSrcCol)
    previousGenCol = mapping.genCol
    previousSrcLine = mapping.srcLine
    previousSrcCol = mapping.srcCol
  }
  return out
}

const ORIGINAL_SOURCE = [
  '// original source',
  'export function throwsInChunk() {',
  "  throw new Error('boom')",
  '}',
  '',
].join('\n')
// 1-based position of `new Error` in the original source above.
const ORIGINAL_LINE = 3
const ORIGINAL_COLUMN = 9

/**
 * Compiles an original source for real (SWC, like `next dev` compiles
 * modules) and assembles the chunk the way bundlers do: the compiled module
 * sits below `offsetLines` of runtime code, and the module's own source map
 * is shifted by prepending empty generated lines to `mappings`.
 */
async function compileChunk(
  originalSource,
  { moduleFormat = 'cjs', offsetLines = 100 } = {}
) {
  const swc = require(path.join(nextDist, 'build/swc'))
  const output = await swc.transform(originalSource, {
    filename: 'original.js',
    sourceMaps: true,
    module: { type: moduleFormat === 'esm' ? 'es6' : 'commonjs' },
    jsc: { target: 'es2022' },
  })
  const map = JSON.parse(output.map)
  map.mappings = ';'.repeat(offsetLines) + map.mappings
  const padding = new Array(offsetLines).fill('/* runtime */')
  return { code: padding.join('\n') + '\n' + output.code, map }
}

/** The generated 1-based position mapping to the given original position. */
async function findGeneratedPosition(map, srcLine1, srcCol1) {
  const { SourceMapConsumer } = require(
    path.join(nextDist, 'compiled/source-map08')
  )
  const consumer = await new SourceMapConsumer(map)
  const position = consumer.generatedPositionFor({
    source: map.sources[0],
    line: srcLine1,
    column: srcCol1 - 1,
  })
  consumer.destroy()
  return { line1: position.line, column1: position.column + 1 }
}

/**
 * Generates chunk code whose `throw new Error(...)` sits at `throwLine1`,
 * mirroring how a function ends up deep inside a bundled chunk.
 */
// Synthetic chunk generator for the fixtures whose subject is the map or
// cache shape itself (evals, HMR updates, index map sections, sparse
// mappings); everything else compiles real chunks via `compileChunk`.
function generateChunkCode(throwLine1, message, { moduleFormat = 'cjs' } = {}) {
  const throwingLine = `function throwsInChunk() { throw new Error(${JSON.stringify(message)}); }`
  const lines = ['"use strict";']
  while (lines.length < throwLine1 - 1) {
    lines.push('/* padding */')
  }
  lines.push(throwingLine)
  lines.push(
    moduleFormat === 'cjs'
      ? 'module.exports = { throwsInChunk: throwsInChunk };'
      : moduleFormat === 'esm'
        ? 'export { throwsInChunk };'
        : // The completion value of the eval'd code.
          '({ throwsInChunk: throwsInChunk });'
  )
  return {
    code: lines.join('\n'),
    // 1-based position of `new Error` in the generated code.
    line1: throwLine1,
    column1: throwingLine.indexOf('new Error') + 1,
  }
}

function generateSourceMap(chunk, sourceMapFileName) {
  return {
    version: 3,
    file: path.basename(sourceMapFileName, '.map'),
    sources: ['original.js'],
    sourcesContent: [ORIGINAL_SOURCE],
    names: [],
    mappings: encodeMappings([
      {
        genLine: chunk.line1 - 1,
        genCol: chunk.column1 - 1,
        srcLine: ORIGINAL_LINE - 1,
        srcCol: ORIGINAL_COLUMN - 1,
      },
    ]),
  }
}

async function writeChunkFixture(
  dir,
  chunkFileName,
  {
    sourceMap = true,
    mapShape = 'basic',
    ignoreList = false,
    message = `boom:${chunkFileName}`,
    moduleFormat = 'cjs',
    source = [
      '// original source',
      'export function throwsInChunk() {',
      `  throw new Error(${JSON.stringify(message)})`,
      '}',
      '',
    ].join('\n'),
  } = {}
) {
  if (moduleFormat === 'esm') {
    chunkFileName = chunkFileName.replace(/\.js$/, '.mjs')
  }
  const { code, map: compiledMap } = await compileChunk(source, {
    moduleFormat,
  })
  // Turbopack dev server chunks reference their sources by absolute
  // percent-encoded `file://` URI.
  compiledMap.sources = compiledMap.sources.map(
    (sourceName) => url.pathToFileURL(path.join(dir, sourceName)).href
  )
  const chunkPath = path.join(dir, chunkFileName)
  let chunkCode = code
  if (sourceMap) {
    const mapFileName = `${chunkFileName}.map`
    let map = compiledMap
    if (mapShape === 'sparse') {
      // A map with only the throw's own mapping. Real maps are dense;
      // sparse ones split the consumers (see the `sparse-mappings`
      // scenario).
      const generated = await findGeneratedPosition(
        compiledMap,
        ORIGINAL_LINE,
        ORIGINAL_COLUMN
      )
      map = {
        version: 3,
        file: chunkFileName,
        sources: compiledMap.sources,
        sourcesContent: compiledMap.sourcesContent,
        names: [],
        mappings: encodeMappings([
          {
            genLine: generated.line1 - 1,
            genCol: generated.column1 - 1,
            srcLine: ORIGINAL_LINE - 1,
            srcCol: ORIGINAL_COLUMN - 1,
          },
        ]),
      }
    }
    if (ignoreList) {
      map.ignoreList = [0]
    }
    if (mapShape !== 'basic' && mapShape !== 'sparse') {
      if (mapShape === 'index-relative-sources') {
        map.sources = ['original.js']
      }
      map = {
        version: 3,
        sections: [{ offset: { line: 0, column: 0 }, map }],
      }
      if (mapShape !== 'index') {
        // Turbopack emits index maps with an empty top-level `sources` array,
        // which the source map spec does not allow for index maps.
        map.sources = []
      }
    }
    fs.writeFileSync(
      path.join(dir, mapFileName),
      mapShape === 'invalid' ? 'not a source map' : JSON.stringify(map)
    )
    chunkCode += `\n//# sourceMappingURL=${mapFileName}`
  }
  fs.writeFileSync(chunkPath, chunkCode)
  fs.writeFileSync(path.join(dir, 'original.js'), source)
  return chunkPath
}

// ---------------------------------------------------------------------------
// The elided Flight boundary
// ---------------------------------------------------------------------------

function createFlightRequest(producerEnvironmentName) {
  // The request reduced to the fields the copied producer code reads. The
  // environment name is a function like the staged dev render's, evaluated
  // at each serialization.
  return {
    environmentName: () => producerEnvironmentName,
    filterStackFrame: sourceMaps.filterStackFrameDEV,
    writtenObjects: new Map(),
    writtenDebugObjects: new Map(),
    nextChunkId: 1,
    pendingDebugChunks: 0,
    completedErrorChunks: [],
    completedDebugChunks: [],
    _outlinedRows: {},
  }
}

/**
 * Serializes a thrown value like the Flight server's `emitErrorChunk`, into
 * the error info row and the outlined rows it references.
 */
function serializeThrown(thrown, producerEnvironmentName, digest, owner) {
  const request = createFlightRequest(producerEnvironmentName)
  R.emitErrorChunk(request, 0, digest, thrown, false, owner)
  const row = request.completedErrorChunks[0]
  return {
    errorInfo: JSON.parse(row.slice(row.indexOf(':E') + 2)),
    outlinedModels: request._outlinedRows,
  }
}

/**
 * The dev RSC render's `onError`: digests are hashed from the error's stack
 * (materializing it before React's `parseStackTrace` runs) unless the error
 * carries one, errors are recorded for cross-boundary dedup in a map that
 * lives on the request's work store (one per scenario process), and known
 * confusing messages are rewritten after the digest. Logging is elided.
 */
const reactServerErrorsByDigest = new Map()
const handleError = createReactServerErrorHandler(
  true,
  false,
  reactServerErrorsByDigest,
  () => {}
)

/**
 * Serializes a value model like `logMessagesAndSendErrorsToBrowser` renders
 * the `{ errors }` payload for the dev overlay, or like instant validation
 * re-encodes revived segment trees: errors inside the value go through
 * `serializeErrorValue` and lose their digest.
 */
function serializeValue(value, producerEnvironmentName) {
  const request = createFlightRequest(producerEnvironmentName)
  const id = R.outlineModel(request, value)
  return {
    rootReference: '$' + id.toString(16),
    outlinedModels: request._outlinedRows,
  }
}

function serializeError(error, producerEnvironmentName, owner = null) {
  // Like `logRecoverableError`.
  const digest = handleError(error) || ''
  return serializeThrown(error, producerEnvironmentName, digest, owner)
}

/** Like `serializeError` for a thrown value that is not an `Error`. */
function serializeThrownValue(value, producerEnvironmentName) {
  return serializeThrown(
    value,
    producerEnvironmentName,
    handleError(value) || '',
    null
  )
}

/**
 * What the Flight client does when it revives a serialized error. Each hop
 * crosses into a different consumer (e.g. the page render and then the SSR
 * render), and each consumer is a separate copy of the Flight client module
 * with its own fake function cache. Like the real Flight client, the copy
 * lives in a `node_modules` directory and revives from a task with no other
 * user code on the stack, so that everything below the fake stack frames is
 * dropped when the revived error's stack is serialized again.
 */
let flightClientInstances = 0
function createFlightClientInstance(
  dir,
  { environmentName, findSourceMapURL = sourceMaps.findSourceMapURLDEV } = {}
) {
  const packageDir = path.join(
    dir,
    `consumer-${flightClientInstances++}`,
    'node_modules',
    'flight-client'
  )
  fs.mkdirSync(packageDir, { recursive: true })
  fs.copyFileSync(
    require.resolve('./react-flight-semantics'),
    path.join(packageDir, 'react-flight-semantics.js')
  )
  fs.writeFileSync(
    path.join(packageDir, 'index.js'),
    [
      "const R = require('./react-flight-semantics.js')",
      'exports.reviveError = (errorInfo, outlinedModels, findSourceMapURL, environmentName) => {',
      "  environmentName = environmentName === undefined ? 'Server' : environmentName",
      '  return new Promise((resolve) => {',
      '    setImmediate(() => {',
      '      // The response reduced to the fields the copied consumer code',
      '      // reads, like `createResponse` with the environmentName option',
      "      // (the use-cache consumer passes 'Cache').",
      '      const response = {',
      '        _debugFindSourceMapURL: findSourceMapURL,',
      '        _debugRootTask: console.createTask(',
      "          '\"use ' + environmentName.toLowerCase() + '\"'",
      '        ),',
      '        _rootEnvironmentName: environmentName,',
      '        _chunks: new Map(),',
      '        _closed: false,',
      '        _closedReason: null,',
      '        _allowPartialStream: false,',
      '        _pendingChunks: 0,',
      '        _weakResponse: { response: null },',
      '        _pendingInitialRender: null,',
      '        _debugEndTime: null,',
      '      }',
      '      // Each outlined row resolves like the stream would resolve it.',
      '      for (const id in outlinedModels) {',
      '        response._chunks.set(',
      '          parseInt(id, 16),',
      '          R.createResolvedModelChunk(response, outlinedModels[id])',
      '        )',
      '      }',
      '      resolve(R.resolveErrorDev(response, errorInfo))',
      '    })',
      '  })',
      '}',
      'exports.reviveValue = (reference, outlinedModels, findSourceMapURL, environmentName) => {',
      "  environmentName = environmentName === undefined ? 'Server' : environmentName",
      '  return new Promise((resolve) => {',
      '    setImmediate(() => {',
      '      const response = {',
      '        _debugFindSourceMapURL: findSourceMapURL,',
      '        _debugRootTask: console.createTask(',
      "          '\"use ' + environmentName.toLowerCase() + '\"'",
      '        ),',
      '        _rootEnvironmentName: environmentName,',
      '        _chunks: new Map(),',
      '        _closed: false,',
      '        _closedReason: null,',
      '        _allowPartialStream: false,',
      '        _pendingChunks: 0,',
      '        _weakResponse: { response: null },',
      '        _pendingInitialRender: null,',
      '        _debugEndTime: null,',
      '      }',
      '      for (const id in outlinedModels) {',
      '        response._chunks.set(',
      '          parseInt(id, 16),',
      '          R.createResolvedModelChunk(response, outlinedModels[id])',
      '        )',
      '      }',
      '      resolve(R.reviveRootModel(response, reference))',
      '    })',
      '  })',
      '}',
    ].join('\n')
  )
  const instance = require(path.join(packageDir, 'index.js'))
  return {
    // Revives a value model, like the `{ errors }` payload the dev overlay
    // receives. No digest is assigned: only error chunks carry one.
    reviveValue({ rootReference, outlinedModels }) {
      return instance.reviveValue(
        rootReference,
        outlinedModels,
        findSourceMapURL,
        environmentName
      )
    },
    async reviveError({ errorInfo, outlinedModels }) {
      const error = await instance.reviveError(
        errorInfo,
        outlinedModels,
        findSourceMapURL,
        environmentName
      )
      // The real caller of `resolveErrorDev` assigns the serialized digest to
      // the revived error.
      error.digest = errorInfo.digest
      return error
    },
  }
}

// ---------------------------------------------------------------------------
// Debugger-faithful observations
// ---------------------------------------------------------------------------

const parsedScripts = []
const session = new inspector.Session()
session.connect()
session.on('Debugger.scriptParsed', ({ params }) => {
  parsedScripts.push({
    scriptId: params.scriptId,
    url: params.url,
    sourceMapURL: params.sourceMapURL ?? '',
  })
})

function post(method, params) {
  return new Promise((resolve, reject) => {
    session.post(method, params, (err, result) =>
      err ? reject(err) : resolve(result)
    )
  })
}

// The method name is matched greedily, like in React's `frameRegExp`, so
// frames whose name embeds an eval origin split at the same position.
const FRAME_RE = /^ {4}at (.+) \((.+):(\d+):(\d+)\)$/m

/** Like `symbolicateTopFrameLikeADebugger`, for a frame further down. */
function symbolicateFrameLikeADebugger(stackText, methodName) {
  const line = stackText
    .split('\n')
    .find((frameLine) => frameLine.includes(` at ${methodName} (`))
  return symbolicateTopFrameLikeADebugger(line ?? '')
}

/**
 * Resolves the top frame of an error's stack text the way a debugger
 * frontend would: bind the frame's URL to the script loaded under that URL,
 * then map the position through that script's own source map.
 */
function symbolicateTopFrameLikeADebugger(stackText) {
  const match = FRAME_RE.exec(stackText)
  if (match === null) {
    return { frame: null }
  }
  const [, methodName, frameURL, line1, column1] = match
  return symbolicatePosition({
    methodName,
    url: frameURL,
    line1: +line1,
    column1: +column1,
  })
}

// Set by scenarios whose fake scripts carry `http:` source map URLs (the
// browser consumer): resolves the URL like a debugger fetching through the
// dev server.
let resolveHttpSourceMap = null

function symbolicatePosition(frame) {
  const frameURL = frame.url
  const script = parsedScripts.findLast((parsed) => parsed.url === frameURL)
  if (script === undefined) {
    return { frame, script: null }
  }
  if (script.sourceMapURL === '') {
    return { frame, script: { hasSourceMap: false }, original: null }
  }

  const dataPrefix = 'data:application/json;base64,'
  const payload = script.sourceMapURL.startsWith(dataPrefix)
    ? JSON.parse(
        Buffer.from(
          script.sourceMapURL.slice(dataPrefix.length),
          'base64'
        ).toString('utf8')
      )
    : script.sourceMapURL.startsWith('http:')
      ? (resolveHttpSourceMap(script.sourceMapURL) ?? undefined)
      : JSON.parse(
          fs.readFileSync(
            url.fileURLToPath(new URL(script.sourceMapURL, frameURL)),
            'utf8'
          )
        )
  if (payload === undefined) {
    return { frame, script: { hasSourceMap: true }, original: null }
  }
  const entry = new SourceMap(payload).findEntry(
    frame.line1 - 1,
    frame.column1 - 1
  )
  return {
    frame,
    script: { hasSourceMap: true },
    original:
      entry.originalSource === undefined
        ? null
        : { source: entry.originalSource, line1: entry.originalLine + 1 },
  }
}

/**
 * Reads the async part of an error's stack the way an attached debugger
 * frontend shows it: the `console.createTask` chain recorded when the error
 * was constructed. Each task's top frame is the `createTask` call inside
 * the owner's fake stack frames.
 */
async function observeOwnerTaskChain(error) {
  globalThis.__observedError = error
  const { result } = await post('Runtime.evaluate', {
    expression: '__observedError',
  })
  const { exceptionDetails } = await post('Runtime.getExceptionDetails', {
    errorObjectId: result.objectId,
  })
  const chain = []
  for (
    let stackTrace = exceptionDetails.stackTrace?.parent;
    stackTrace !== undefined;
    stackTrace = stackTrace.parent
  ) {
    const top = stackTrace.callFrames[0]
    chain.push({
      description: stackTrace.description ?? '',
      top:
        top === undefined
          ? null
          : symbolicatePosition({
              methodName: top.functionName,
              url: top.url,
              line1: top.lineNumber + 1,
              column1: top.columnNumber + 1,
            }),
    })
  }
  return chain
}

function observeError(environmentName, error) {
  const stackText = String(error.stack)
  return {
    environmentName,
    stack: stackText,
    symbolicated: symbolicateTopFrameLikeADebugger(stackText),
    terminal: util.inspect(error, { colors: false }),
  }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

function throwAndCatch(fn) {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected the fixture to throw')
}

/**
 * Revives an error across the given chain of producer environments, like an
 * error thrown in "use cache" that is revived by the page render and then
 * revived again by the SSR render of the page. Revived errors carry the
 * environment they were first serialized in, which takes precedence on every
 * further serialization.
 */
async function reviveAcrossEnvironments(
  dir,
  originalError,
  producerEnvironments
) {
  const revived = []
  let error = originalError
  for (const producerEnvironmentName of producerEnvironments) {
    const wire = serializeError(error, producerEnvironmentName)
    error = await createFlightClientInstance(dir).reviveError(wire)
    revived.push({ environmentName: wire.errorInfo.env, error })
  }
  // Stacks are only observed after the whole chain: in the real system, a
  // revived error's stack is first read during the next serialization (by
  // `parseStackTrace`), or not at all.
  return revived.map(({ environmentName, error }) =>
    observeError(environmentName, error)
  )
}

/**
 * A module standing in for compiled JSX: `jsx` captures the
 * `react-stack-top-frame` error like `jsxDEV` does, so each render function
 * yields a debug stack whose top frame (after skipping the factory frame)
 * is its own callsite in the original source.
 */
async function writeOwnerFixture(
  dir,
  { pageEnvironmentName, layoutEnvironmentName = 'Server' }
) {
  const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
    source: [
      '// original source',
      'export function throwsInChunk() {',
      "  throw new Error('boom:owner')",
      '}',
      'function jsx() {',
      "  return new Error('react-stack-top-frame')",
      '}',
      'export function renderPage() {',
      '  return jsx()',
      '}',
      'export function renderLayout() {',
      '  return jsx()',
      '}',
      '',
    ].join('\n'),
  })
  const mod = require(chunkPath)
  const layoutInfo = {
    name: 'Layout',
    env: layoutEnvironmentName,
    key: null,
    owner: null,
    props: {},
    debugStack: mod.renderLayout(),
  }
  const pageInfo = {
    name: 'Page',
    env: pageEnvironmentName,
    key: null,
    owner: layoutInfo,
    props: {},
    debugStack: mod.renderPage(),
  }
  const error = throwAndCatch(() => mod.throwsInChunk())
  return { pageInfo, error }
}

// Chunk-loading scenarios run in both module formats: frames of CJS chunks
// carry file paths, frames of ES modules carry (percent-encoded) `file://`
// URLs, and Node.js keys their source maps through different loader caches.
const chunkModuleFormat = process.argv[3] === 'esm' ? 'esm' : 'cjs'

function chunkFixtureOptions(options = {}) {
  return { ...options, moduleFormat: chunkModuleFormat }
}

async function loadChunk(chunkPath) {
  return chunkModuleFormat === 'esm'
    ? await import(url.pathToFileURL(chunkPath).href)
    : require(chunkPath)
}

const scenarios = {
  async 'one-hop'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'two-hops-bracket-chunk'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      '[root-of-the-server]__sim._.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Cache', 'Server']),
    }
  },

  async 'missing-source-map'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions({ sourceMap: false })
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'three-hops'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, [
        'Cache',
        'Server',
        'Prerender',
      ]),
    }
  },

  // Chunk basenames stay plain even in exotic setups; special characters
  // arrive through the project path (`next dev "my project"`), so they are
  // modeled as directory names.
  async 'space-in-project-path'(dir) {
    const projectDir = path.join(dir, 'my project')
    fs.mkdirSync(projectDir)
    const chunkPath = await writeChunkFixture(
      projectDir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Cache', 'Server']),
    }
  },

  async 'unicode-in-project-path'(dir) {
    const projectDir = path.join(dir, 'café')
    fs.mkdirSync(projectDir)
    const chunkPath = await writeChunkFixture(
      projectDir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Cache', 'Server']),
    }
  },

  async 'percent-in-project-path'(dir) {
    const projectDir = path.join(dir, 'per%cent')
    fs.mkdirSync(projectDir)
    const chunkPath = await writeChunkFixture(
      projectDir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Cache', 'Server']),
    }
  },

  // Real bundler maps are dense. With a map covering only the throw itself,
  // the consumers split: the debugger's whole-map lookup resolves other
  // frames to the nearest preceding mapping, while the terminal consumer
  // only matches mappings on the frame's own line and falls back to the
  // raw URL.
  async 'sparse-mappings'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      mapShape: 'sparse',
      source: [
        '// original source',
        'export function throwsInChunk() {',
        "  throw new Error('boom:sparse')",
        '}',
        'export function callsThrough() {',
        '  return throwsInChunk()',
        '}',
        '',
      ].join('\n'),
    })
    const error = throwAndCatch(() => require(chunkPath).callsThrough())
    const hops = await reviveAcrossEnvironments(dir, error, ['Server'])
    for (const hop of hops) {
      hop.symbolicatedCaller = symbolicateFrameLikeADebugger(
        hop.stack,
        'Object.callsThrough'
      )
    }
    return { hops }
  },

  async 'index-source-map'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions({ mapShape: 'index-with-empty-sources' })
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Cache', 'Server']),
    }
  },

  async 'index-source-map-relative-sources'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions({ mapShape: 'index-relative-sources' })
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'spec-index-source-map'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions({ mapShape: 'index' })
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'invalid-source-map'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions({ mapShape: 'invalid' })
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'node-modules-frames'(dir) {
    const packageDir = path.join(dir, 'node_modules', 'some-pkg')
    fs.mkdirSync(packageDir, { recursive: true })
    const chunkPath = await writeChunkFixture(packageDir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'anonymous-frames'(dir) {
    const chunk = generateChunkCode(101, 'boom:anonymous', {
      moduleFormat: 'eval',
    })
    // eslint-disable-next-line no-eval
    const moduleExports = (0, eval)(chunk.code)
    const error = throwAndCatch(() => moduleExports.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'fake-function-cache'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const first = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const second = throwAndCatch(() => require(chunkPath).throwsInChunk())
    // One consumer reviving two errors with identical frames.
    const consumer = createFlightClientInstance(dir)
    const revived = []
    for (const error of [first, second]) {
      const wire = serializeError(error, 'Server')
      revived.push({
        environmentName: wire.errorInfo.env,
        error: await consumer.reviveError(wire),
      })
    }
    return {
      hops: revived.map(({ environmentName, error }) =>
        observeError(environmentName, error)
      ),
    }
  },

  async 'multiple-chunks'(dir) {
    await writeChunkFixture(dir, 'chunk-b.js', { message: 'boom:chunk-b.js' })
    const chunkAPath = await writeChunkFixture(dir, 'chunk-a.js', {
      source: [
        '// original source',
        "import { throwsInChunk } from './chunk-b.js'",
        'export function callsThrough() {',
        '  return throwsInChunk()',
        '}',
        '',
      ].join('\n'),
    })
    const error = throwAndCatch(() => require(chunkAPath).callsThrough())
    const hops = await reviveAcrossEnvironments(dir, error, ['Cache', 'Server'])
    for (const hop of hops) {
      hop.symbolicatedCaller = symbolicateFrameLikeADebugger(
        hop.stack,
        'Object.callsThrough'
      )
    }
    return { hops }
  },

  async 'multi-line-message'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const { throwsInChunk } = require(chunkPath)
    const error = throwAndCatch(() => {
      try {
        throwsInChunk()
      } catch (cause) {
        cause.message =
          'first line\nsecond line\n    at phantom (file:///not-a-frame.js:1:1)'
        throw cause
      }
    })
    const hops = await reviveAcrossEnvironments(dir, error, ['Server'])
    const { getStackWithoutErrorMessage } = require(
      path.join(nextDist, 'lib/format-server-error')
    )
    for (const hop of hops) {
      hop.symbolicatedThrow = symbolicateFrameLikeADebugger(
        hop.stack,
        'throwsInChunk'
      )
      // `app-render` strips the message off `error.stack` for the overlay
      // payload; only the first line goes, so multi-line messages leak.
      hop.stackWithoutMessage = getStackWithoutErrorMessage({
        stack: hop.stack,
      })
    }
    return { hops }
  },

  async 'module-evaluation-throw'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      moduleFormat: chunkModuleFormat,
      source: [
        '// original source',
        'export function throwsInChunk() {',
        "  throw new Error('boom:evaluation')",
        '}',
        'throwsInChunk()',
        '',
      ].join('\n'),
    })
    let error
    try {
      await loadChunk(chunkPath)
      throw new Error('expected the fixture to throw')
    } catch (thrown) {
      error = thrown
    }
    const hops = await reviveAcrossEnvironments(dir, error, ['Server'])
    for (const hop of hops) {
      // The ESM module-evaluation frame is nameless and revives under the
      // fake function's fallback name.
      hop.symbolicatedModuleFrame = symbolicateFrameLikeADebugger(
        hop.stack,
        chunkModuleFormat === 'esm' ? '<anonymous>' : 'Object.<anonymous>'
      )
    }
    return { hops }
  },

  async 'thrown-string'(dir) {
    const revived = await createFlightClientInstance(dir).reviveError(
      serializeThrownValue('boom:string', 'Server')
    )
    return { hops: [observeError('Server', revived)] }
  },

  async 'custom-error-name'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => {
      try {
        require(chunkPath).throwsInChunk()
      } catch (cause) {
        cause.name = 'CustomError'
        throw cause
      }
    })
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'chunk-deleted-after-require'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    fs.rmSync(chunkPath)
    fs.rmSync(`${chunkPath}.map`)
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'repeated-hmr-updates'(dir) {
    // Two updates of the same module: both are eval'd under the same
    // `//# sourceURL`, each with its own inline source map.
    const sourceURL = `${url.pathToFileURL(path.join(dir, 'chunk.js')).href}?module-id`
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)
    const evalUpdate = (throwLine1, srcLine1) => {
      const chunk = generateChunkCode(throwLine1, 'boom:update', {
        moduleFormat: 'eval',
      })
      const map = {
        version: 3,
        file: 'chunk.js',
        sources: ['original.js'],
        sourcesContent: [ORIGINAL_SOURCE],
        names: [],
        mappings: encodeMappings([
          {
            genLine: chunk.line1 - 1,
            genCol: chunk.column1 - 1,
            srcLine: srcLine1 - 1,
            srcCol: 0,
          },
        ]),
      }
      const code =
        chunk.code +
        '\n\n//# sourceURL=' +
        sourceURL +
        '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
        Buffer.from(JSON.stringify(map)).toString('base64')
      // eslint-disable-next-line no-eval
      return (0, eval)(code)
    }
    const first = evalUpdate(101, 2)
    const firstError = throwAndCatch(() => first.throwsInChunk())
    const firstHops = await reviveAcrossEnvironments(dir, firstError, [
      'Server',
    ])
    const second = evalUpdate(101, 3)
    const secondError = throwAndCatch(() => second.throwsInChunk())
    const secondHops = await reviveAcrossEnvironments(dir, secondError, [
      'Server',
    ])
    return { hops: [...firstHops, ...secondHops] }
  },

  // A file-based chunk replaced on disk, like webpack HMR writes updates:
  // the module cache is busted, Node.js re-reads the source map, but
  // `findSourceMapURLDEV`'s cache still serves the first map to revivals.
  async 'chunk-file-edited'(dir) {
    const writeVersion = (srcLine1) => {
      const chunk = generateChunkCode(101, 'boom:edited')
      const map = generateSourceMap(chunk, 'chunk.js.map')
      map.mappings = encodeMappings([
        {
          genLine: chunk.line1 - 1,
          genCol: chunk.column1 - 1,
          srcLine: srcLine1 - 1,
          srcCol: 0,
        },
      ])
      fs.writeFileSync(path.join(dir, 'chunk.js.map'), JSON.stringify(map))
      fs.writeFileSync(
        path.join(dir, 'chunk.js'),
        chunk.code + '\n//# sourceMappingURL=chunk.js.map'
      )
    }
    const chunkPath = path.join(dir, 'chunk.js')
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)

    writeVersion(2)
    const firstError = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const firstHops = await reviveAcrossEnvironments(dir, firstError, [
      'Server',
    ])

    writeVersion(3)
    delete require.cache[chunkPath]
    const secondError = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const secondHops = await reviveAcrossEnvironments(dir, secondError, [
      'Server',
    ])
    return { hops: [...firstHops, ...secondHops] }
  },

  // ES module updates cannot replace a cached URL, so dev servers bust the
  // import with a query.
  async 'esm-query-busted-reload'(dir) {
    const writeVersion = (srcLine1) => {
      const chunk = generateChunkCode(101, 'boom:reloaded', {
        moduleFormat: 'esm',
      })
      const map = generateSourceMap(chunk, 'chunk.mjs.map')
      map.mappings = encodeMappings([
        {
          genLine: chunk.line1 - 1,
          genCol: chunk.column1 - 1,
          srcLine: srcLine1 - 1,
          srcCol: 0,
        },
      ])
      fs.writeFileSync(path.join(dir, 'chunk.mjs.map'), JSON.stringify(map))
      fs.writeFileSync(
        path.join(dir, 'chunk.mjs'),
        chunk.code + '\n//# sourceMappingURL=chunk.mjs.map'
      )
    }
    const chunkURL = url.pathToFileURL(path.join(dir, 'chunk.mjs')).href
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)

    writeVersion(2)
    const first = await import(chunkURL)
    const firstError = throwAndCatch(() => first.throwsInChunk())
    const firstHops = await reviveAcrossEnvironments(dir, firstError, [
      'Server',
    ])

    writeVersion(3)
    const second = await import(`${chunkURL}?v=2`)
    const secondError = throwAndCatch(() => second.throwsInChunk())
    const secondHops = await reviveAcrossEnvironments(dir, secondError, [
      'Server',
    ])
    return { hops: [...firstHops, ...secondHops] }
  },

  async 'multi-section-index-map'(dir) {
    const chunk = generateChunkCode(101, 'boom:sections')
    const emptySection = {
      version: 3,
      file: 'chunk.js',
      sources: [url.pathToFileURL(path.join(dir, 'unrelated.js')).href],
      sourcesContent: ['// unrelated'],
      names: [],
      mappings: 'AAAA',
    }
    const throwingSection = {
      version: 3,
      file: 'chunk.js',
      sources: [url.pathToFileURL(path.join(dir, 'original.js')).href],
      sourcesContent: [ORIGINAL_SOURCE],
      names: [],
      mappings: encodeMappings([
        {
          // Section-relative: the section starts at generated line 50.
          genLine: chunk.line1 - 1 - 50,
          genCol: chunk.column1 - 1,
          srcLine: ORIGINAL_LINE - 1,
          srcCol: ORIGINAL_COLUMN - 1,
        },
      ]),
    }
    fs.writeFileSync(
      path.join(dir, 'chunk.js.map'),
      JSON.stringify({
        version: 3,
        sources: [],
        sections: [
          { offset: { line: 0, column: 0 }, map: emptySection },
          { offset: { line: 50, column: 0 }, map: throwingSection },
        ],
      })
    )
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)
    fs.writeFileSync(
      path.join(dir, 'chunk.js'),
      chunk.code + '\n//# sourceMappingURL=chunk.js.map'
    )
    const error = throwAndCatch(() =>
      require(path.join(dir, 'chunk.js')).throwsInChunk()
    )
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'partial-ignore-list'(dir) {
    const chunk = generateChunkCode(101, 'boom:partial')
    const map = generateSourceMap(chunk, 'chunk.js.map')
    map.sources.push('vendor.js')
    map.sourcesContent.push('// vendor')
    map.ignoreList = [1]
    fs.writeFileSync(path.join(dir, 'chunk.js.map'), JSON.stringify(map))
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)
    fs.writeFileSync(
      path.join(dir, 'chunk.js'),
      chunk.code + '\n//# sourceMappingURL=chunk.js.map'
    )
    const error = throwAndCatch(() =>
      require(path.join(dir, 'chunk.js')).throwsInChunk()
    )
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'fan-out-consumers'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const wire = serializeError(error, 'Server')
    const hops = []
    for (const consumer of [
      createFlightClientInstance(dir),
      createFlightClientInstance(dir),
    ]) {
      hops.push(
        observeError(wire.errorInfo.env, await consumer.reviveError(wire))
      )
    }
    return { hops }
  },

  async 'symlinked-project-dir'(dir) {
    const realDir = path.join(dir, 'real')
    fs.mkdirSync(realDir)
    const chunkPath = await writeChunkFixture(
      realDir,
      'chunk.js',
      chunkFixtureOptions()
    )
    fs.symlinkSync(realDir, path.join(dir, 'linked'))
    // Both loaders realpath the module, so the frames carry the real path.
    const mod = await loadChunk(
      path.join(dir, 'linked', path.basename(chunkPath))
    )
    const error = throwAndCatch(() => mod.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'hash-in-project-path'(dir) {
    const projectDir = path.join(dir, 'my#app')
    fs.mkdirSync(projectDir)
    const chunkPath = await writeChunkFixture(
      projectDir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Cache', 'Server']),
    }
  },

  async 'node-modules-substring-in-project-path'(dir) {
    const projectDir = path.join(dir, 'my_node_modules_backup')
    fs.mkdirSync(projectDir)
    const chunkPath = await writeChunkFixture(
      projectDir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'native-and-builtin-frames'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const { throwsInChunk } = require(chunkPath)
    const error = throwAndCatch(() => [1].map(throwsInChunk))
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'new-promise-frames'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const { throwsInChunk } = require(chunkPath)
    // A throw inside an executor rejects the promise with a stack that has a
    // `new Promise (<anonymous>)` frame.
    const error = await new Promise(() => throwsInChunk()).then(
      () => {
        throw new Error('expected the fixture to throw')
      },
      (thrown) => thrown
    )
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'constructor-frames'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      source: [
        '// original source',
        'export class Boom {',
        '  constructor() {',
        "    throw new Error('boom:constructor')",
        '  }',
        '}',
        '',
      ].join('\n'),
    })
    const { Boom } = require(chunkPath)
    const error = throwAndCatch(() => new Boom())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'dev-overlay-frames'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const hops = await reviveAcrossEnvironments(dir, error, ['Server'])
    // The dev overlay resolves the revived error's frames server-side: the
    // client parses the stack text and posts the frames to
    // `/__nextjs_original-stack-frames`.
    const { getOriginalStackFrames } = require(
      path.join(nextDist, 'server/dev/middleware-turbopack')
    )
    const { parseStack } = require(
      path.join(nextDist, 'server/lib/parse-stack')
    )
    const project = {
      async traceSource() {
        return null
      },
      async getSourceMap() {
        return null
      },
    }
    const { DEVTOOLS_CODE_FRAME_MAX_WIDTH } = require(
      path.join(nextDist, 'next-devtools/server/shared')
    )
    hops[0].overlayFrames = (
      await getOriginalStackFrames({
        project,
        projectPath: dir,
        frames: parseStack(hops[0].stack, dir),
        isServer: true,
        isEdgeServer: false,
        isAppDirectory: true,
        // Like the `/__nextjs_original-stack-frames` endpoint the redbox
        // posts to.
        codeFrameOptions: {
          colors: true,
          maxWidth: DEVTOOLS_CODE_FRAME_MAX_WIDTH,
        },
      })
    ).map((entry) =>
      entry.status === 'rejected'
        ? { status: entry.status, reason: String(entry.reason) }
        : entry
    )
    return { hops }
  },

  async 'owner-stack-rewrite'(dir) {
    const { workUnitAsyncStorage } = require(
      path.join(nextDist, 'server/app-render/work-unit-async-storage.external')
    )
    const { applyOwnerStack } = require(
      path.join(nextDist, 'server/dynamic-rendering-utils')
    )
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      source: [
        '// original source',
        'export function throwsInChunk() {',
        "  throw new Error('boom:owner-rewrite')",
        '}',
        'export function Page() {',
        '  return throwsInChunk()',
        '}',
        '',
      ].join('\n'),
    })
    const mod = require(chunkPath)
    // Sync-IO validation errors get their stack rewritten before they are
    // serialized: the error's own frames are kept up to React's bottom
    // frame, then the owner stack is appended.
    const react_stack_bottom_frame = () => mod.throwsInChunk()
    const error = throwAndCatch(() => react_stack_bottom_frame())
    // Owner stacks point at real callsites: `Page`'s call at original 6:10.
    const generated = await findGeneratedPosition(
      JSON.parse(fs.readFileSync(`${chunkPath}.map`, 'utf8')),
      6,
      10
    )
    const ownerStack = `\n    at Page (${url.pathToFileURL(chunkPath).href}:${generated.line1}:${generated.column1})`
    const rewritten = workUnitAsyncStorage.run(
      { type: 'cache', outerOwnerStack: ownerStack },
      () => applyOwnerStack(error)
    )
    const hops = await reviveAcrossEnvironments(dir, rewritten, ['Server'])
    for (const hop of hops) {
      hop.symbolicatedCaller = symbolicateFrameLikeADebugger(hop.stack, 'Page')
    }
    return { hops }
  },

  async 'predigested-error'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    // Framework errors like redirects carry their digest, so the handler
    // never materializes the stack and the first serialization parses V8's
    // structured stack trace, with real enclosing function positions.
    error.digest = 'NEXT_REDIRECT;push;/target;307;'
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'formatted-server-error'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      message: 'Class extends value undefined is not a constructor or null',
    })
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'webpack-export-frame-names'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      source: [
        '// original source',
        'function __WEBPACK_DEFAULT_EXPORT__() {',
        "  throw new Error('boom:export')",
        '}',
        'export { __WEBPACK_DEFAULT_EXPORT__ as throwsInChunk }',
        '',
      ].join('\n'),
    })
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'error-with-cause'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      source: [
        '// original source',
        'export function throwsCause() {',
        "  throw new Error('boom:cause')",
        '}',
        'export function throwsOuter() {',
        '  try {',
        '    throwsCause()',
        '  } catch (cause) {',
        "    throw new Error('boom:outer', { cause })",
        '  }',
        '}',
        '',
      ].join('\n'),
    })
    const error = throwAndCatch(() => require(chunkPath).throwsOuter())
    const wire = serializeError(error, 'Server')
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.cause = observeError(revived.cause.environmentName, revived.cause)
    return { hops: [hop] }
  },

  async 'aggregate-error'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const { throwsInChunk } = require(chunkPath)
    const error = throwAndCatch(() => {
      throw new AggregateError(
        [throwAndCatch(throwsInChunk), throwAndCatch(throwsInChunk)],
        'boom:aggregate'
      )
    })
    const wire = serializeError(error, 'Server')
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.revivedConstructor = revived.constructor.name
    hop.errors = revived.errors.map((inner) =>
      observeError(inner.environmentName, inner)
    )
    return { hops: [hop] }
  },

  // The full topology of an error thrown inside "use cache": the cache
  // render serializes it (env 'Cache', with the owning component), the RSC
  // layer revives it from a response created with `environmentName: 'Cache'`
  // like the use-cache consumer's, the staged RSC render re-serializes it
  // (the error's own environment wins over the request's), and the SSR
  // layer revives it from a default 'Server'-rooted response.
  async 'use-cache-layers'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Cache',
      layoutEnvironmentName: 'Cache',
    })
    const cacheWire = serializeError(error, 'Cache', pageInfo)
    const cacheConsumer = createFlightClientInstance(dir, {
      environmentName: 'Cache',
    })
    const revivedInRSC = await cacheConsumer.reviveError(cacheWire)
    const rscHop = observeError(cacheWire.errorInfo.env, revivedInRSC)
    rscHop.ownerTasks = await observeOwnerTaskChain(revivedInRSC)

    const serverWire = serializeError(revivedInRSC, 'Server')
    const ssrConsumer = createFlightClientInstance(dir)
    const revivedInSSR = await ssrConsumer.reviveError(serverWire)
    const ssrHop = observeError(serverWire.errorInfo.env, revivedInSSR)
    ssrHop.ownerTasks = await observeOwnerTaskChain(revivedInSSR)

    return { hops: [rscHop, ssrHop] }
  },

  // Nested "use cache": the inner cache's error crosses an extra Cache-rooted
  // consumer before reaching the RSC and SSR layers.
  async 'nested-cache-layers'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Cache',
      layoutEnvironmentName: 'Cache',
    })
    const layers = [
      {
        producerEnvironmentName: 'Cache',
        owner: pageInfo,
        consumerEnvironmentName: 'Cache',
      },
      {
        producerEnvironmentName: 'Cache',
        owner: null,
        consumerEnvironmentName: 'Cache',
      },
      {
        producerEnvironmentName: 'Server',
        owner: null,
        consumerEnvironmentName: 'Server',
      },
    ]
    const hops = []
    let current = error
    for (const layer of layers) {
      const wire = serializeError(
        current,
        layer.producerEnvironmentName,
        layer.owner
      )
      current = await createFlightClientInstance(dir, {
        environmentName: layer.consumerEnvironmentName,
      }).reviveError(wire)
      const hop = observeError(wire.errorInfo.env, current)
      hop.ownerTasks = await observeOwnerTaskChain(current)
      hops.push(hop)
    }
    return { hops }
  },

  async 'prefetch-environment'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const wire = serializeError(error, 'Prefetch')
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  // Owners are not carried across hops: each serialization attaches the
  // serializing task's own owner.
  async 'owner-at-second-hop'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Server',
    })
    const first = serializeError(error, 'Server')
    const revivedOnce = await createFlightClientInstance(dir).reviveError(first)
    const firstHop = observeError(first.errorInfo.env, revivedOnce)
    firstHop.ownerTasks = await observeOwnerTaskChain(revivedOnce)

    const second = serializeError(revivedOnce, 'Server', pageInfo)
    const revivedTwice =
      await createFlightClientInstance(dir).reviveError(second)
    const secondHop = observeError(second.errorInfo.env, revivedTwice)
    secondHop.ownerTasks = await observeOwnerTaskChain(revivedTwice)
    return { hops: [firstHop, secondHop] }
  },

  async 'owner-stack-inverse-environment'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Server',
    })
    const wire = serializeError(error, 'Cache', pageInfo)
    const revived = await createFlightClientInstance(dir, {
      environmentName: 'Cache',
    }).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  async 'owner-without-stack'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    // An owner that carries no debug stack serializes without one, and the
    // consumer falls back to the root task.
    const pageInfo = {
      name: 'Page',
      env: 'Server',
      key: null,
      owner: null,
      props: {},
    }
    const wire = serializeError(error, 'Server', pageInfo)
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  async 'owner-with-filtered-stack'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    // An owner whose debug stack has only library and runtime frames
    // serializes with an empty stack (unlike no stack at all).
    const pkgDir = path.join(dir, 'node_modules', 'owner-lib')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(
      path.join(pkgDir, 'index.js'),
      [
        "function jsx() { return new Error('react-stack-top-frame'); }",
        'exports.captureAsync = () =>',
        '  new Promise((resolve) => {',
        '    setImmediate(() => resolve(jsx()))',
        '  })',
      ].join('\n')
    )
    const debugStack = await require(
      path.join(pkgDir, 'index.js')
    ).captureAsync()
    const pageInfo = {
      name: 'Page',
      env: 'Server',
      key: null,
      owner: null,
      props: {},
      debugStack,
    }
    const wire = serializeError(error, 'Server', pageInfo)
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  async 'empty-message'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', { message: '' })
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'thrown-object'(dir) {
    const revived = await createFlightClientInstance(dir).reviveError(
      serializeThrownValue({ reason: 'boom', code: 7 }, 'Server')
    )
    return { hops: [observeError('Server', revived)] }
  },

  // The `$` escape and number encodings that also protect serialized stack
  // frames (function names and file paths are strings, native frames carry
  // `NaN` positions), round-tripped through a cause object.
  async 'cause-value-encodings'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => {
      try {
        require(chunkPath).throwsInChunk()
      } catch (cause) {
        cause.cause = {
          reference: '$100',
          negativeZero: -0,
          infinite: Infinity,
          notANumber: NaN,
        }
        throw new Error('boom:outer', { cause })
      }
    })
    const wire = serializeError(error, 'Server')
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.cause = observeError(revived.cause.environmentName, revived.cause)
    return { hops: [hop] }
  },

  async 'nested-cause-chain'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => {
      try {
        require(chunkPath).throwsInChunk()
      } catch (middle) {
        middle.cause = 'root cause'
        throw new Error('boom:outer', { cause: middle })
      }
    })
    const wire = serializeError(error, 'Server')
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.cause = observeError(revived.cause.environmentName, revived.cause)
    return { hops: [hop] }
  },

  // A revived cache error used as the cause of a fresh error: the cause
  // value carries its own environment through `serializeErrorValue`.
  async 'cause-across-environments'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const cacheError = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const revivedCause = await createFlightClientInstance(dir, {
      environmentName: 'Cache',
    }).reviveError(serializeError(cacheError, 'Cache'))
    const error = throwAndCatch(() => {
      throw new Error('boom:outer', { cause: revivedCause })
    })
    const wire = serializeError(error, 'Server')
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.cause = observeError(revived.cause.environmentName, revived.cause)
    return { hops: [hop] }
  },

  // The instant validation chain: a staged render's error chunks are
  // accumulated and revived, the revived tree is re-encoded per segment
  // with an `onError` that only forwards digests, and the resulting error
  // reaches the dev overlay as a value inside the `{ errors }` payload.
  async 'instant-validation-stacks'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Prerender',
      layoutEnvironmentName: 'Prerender',
    })
    const digests = []

    // The staged render serializes the error during the static stage.
    const staged = serializeError(error, 'Prerender', pageInfo)
    digests.push(staged.errorInfo.digest)
    const revivedByValidation =
      await createFlightClientInstance(dir).reviveError(staged)
    const validationHop = observeError(
      staged.errorInfo.env,
      revivedByValidation
    )
    validationHop.ownerTasks = await observeOwnerTaskChain(revivedByValidation)

    // The per-segment re-encode replays the static stage. Its `onError`
    // forwards digests and never mints one (instant-validation.tsx).
    const validationDigest =
      getDigestForWellKnownError(revivedByValidation) ??
      (typeof revivedByValidation.digest === 'string'
        ? revivedByValidation.digest
        : undefined)
    const reencoded = serializeThrown(
      revivedByValidation,
      'Prerender',
      validationDigest || '',
      null
    )
    digests.push(reencoded.errorInfo.digest)
    const revivedFromSegment =
      await createFlightClientInstance(dir).reviveError(reencoded)
    const segmentHop = observeError(reencoded.errorInfo.env, revivedFromSegment)

    // The overlay payload carries the error as a value, dropping the digest.
    const payloadWire = serializeValue(
      { errors: [revivedFromSegment] },
      'Server'
    )
    const payload =
      await createFlightClientInstance(dir).reviveValue(payloadWire)
    const overlayError = payload.errors[0]
    const overlayHop = observeError(overlayError.environmentName, overlayError)
    overlayHop.ownerTasks = await observeOwnerTaskChain(overlayError)

    // A further serialization of the now digest-less error mints a fresh
    // digest, so overlay dedup identity does not survive the value crossing.
    digests.push(serializeError(overlayError, 'Server').errorInfo.digest)

    return {
      hops: [validationHop, segmentHop, overlayHop],
      digests,
    }
  },

  // Errors that never cross a Flight boundary are still printed by the dev
  // server through the same patched inspect.
  async 'unserialized-error-terminal'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      source: [
        '// original source',
        'export function throwsInChunk() {',
        "  throw new Error('boom:unserialized')",
        '}',
        'export function react_stack_bottom_frame() {',
        '  return throwsInChunk()',
        '}',
        '',
      ].join('\n'),
    })
    const mod = require(chunkPath)
    const error = throwAndCatch(() => mod.react_stack_bottom_frame())

    // Native frames print with an `<anonymous>` file the formatter keeps
    // as-is.
    const plainChunk = await writeChunkFixture(dir, 'plain.js')
    const nativeError = throwAndCatch(() =>
      [1].map(require(plainChunk).throwsInChunk)
    )

    // The cut looks for the marker as a substring, so a chunk *file* named
    // like React's bottom frame also truncates the printed stack.
    const markerDir = path.join(dir, 'marker')
    fs.mkdirSync(markerDir)
    const markerChunk = await writeChunkFixture(
      markerDir,
      'react-stack-bottom-frame.js'
    )
    const markerError = throwAndCatch(() =>
      require(markerChunk).throwsInChunk()
    )

    return {
      hops: [
        observeError('unserialized', error),
        observeError('unserialized', nativeError),
        observeError('unserialized', markerError),
      ],
    }
  },

  // One printed stack symbolicates each file once: later frames from the
  // same file reuse the cached consumer — or the cached failure, when the
  // bundler hands back a source map the consumer rejects. (Files without
  // any map are not cached; every frame re-queries.)
  async 'terminal-cache-paths'(dir) {
    const source = (message) =>
      [
        '// original source',
        'export function throwsInChunk() {',
        `  throw new Error(${JSON.stringify(message)})`,
        '}',
        'export function callsThrough() {',
        '  return throwsInChunk()',
        '}',
        '',
      ].join('\n')

    const goodChunk = await writeChunkFixture(dir, 'good.js', {
      source: source('boom:cached-consumer'),
    })
    const good = require(goodChunk)
    const goodError = throwAndCatch(() => good.callsThrough())

    const badDir = path.join(dir, 'bad')
    fs.mkdirSync(badDir)
    const badChunk = await writeChunkFixture(badDir, 'bad.js', {
      source: source('boom:cached-failure'),
      sourceMap: false,
    })
    const section = (line) => ({
      offset: { line, column: 0 },
      map: {
        version: 3,
        sources: ['a.js'],
        sourcesContent: ['x'],
        names: [],
        mappings: 'AAAA',
      },
    })
    const badChunkURL = url.pathToFileURL(badChunk).href
    require(
      path.join(nextDist, 'server/patch-error-inspect')
    ).setBundlerFindSourceMapImplementation((sourceURL) =>
      sourceURL === badChunkURL
        ? // Unordered sections: the sync consumer rejects what the bundler
          // handed back.
          { version: 3, sources: [], sections: [section(100), section(0)] }
        : undefined
    )
    const bad = require(badChunk)
    const badError = throwAndCatch(() => bad.callsThrough())

    return {
      hops: [
        observeError('unserialized', goodError),
        observeError('unserialized', badError),
      ],
    }
  },

  async 'map-source-in-node-modules'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      message: 'boom:vendored',
    })
    // A library chunk maps back to sources under `node_modules`.
    const mapPath = `${chunkPath}.map`
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
    map.sources = ['node_modules/lib/original.js']
    fs.writeFileSync(mapPath, JSON.stringify(map))
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'sandwiched-native-frames'(dir) {
    const pkgDir = path.join(dir, 'node_modules', 'lib')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(
      path.join(pkgDir, 'index.js'),
      [
        'exports.outer = function outer() {',
        '  return [1].map(function inner() {',
        "    throw new Error('boom:sandwich');",
        '  });',
        '};',
      ].join('\n')
    )
    const { outer } = require(path.join(pkgDir, 'index.js'))
    const error = throwAndCatch(() => outer())
    return { hops: [observeError('unserialized', error)] }
  },

  async 'index-map-first-section'(dir) {
    const chunk = generateChunkCode(101, 'boom:sections')
    const throwingSection = {
      version: 3,
      file: 'chunk.js',
      sources: [url.pathToFileURL(path.join(dir, 'original.js')).href],
      sourcesContent: [ORIGINAL_SOURCE],
      names: [],
      mappings: encodeMappings([
        {
          genLine: chunk.line1 - 1,
          genCol: chunk.column1 - 1,
          srcLine: ORIGINAL_LINE - 1,
          srcCol: ORIGINAL_COLUMN - 1,
        },
      ]),
    }
    const emptySection = {
      version: 3,
      file: 'chunk.js',
      sources: [url.pathToFileURL(path.join(dir, 'unrelated.js')).href],
      sourcesContent: ['// unrelated'],
      names: [],
      mappings: 'AAAA',
    }
    fs.writeFileSync(
      path.join(dir, 'chunk.js.map'),
      JSON.stringify({
        version: 3,
        sources: [],
        sections: [
          { offset: { line: 0, column: 0 }, map: throwingSection },
          { offset: { line: 200, column: 0 }, map: emptySection },
        ],
      })
    )
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)
    fs.writeFileSync(
      path.join(dir, 'chunk.js'),
      chunk.code + '\n//# sourceMappingURL=chunk.js.map'
    )
    const error = throwAndCatch(() =>
      require(path.join(dir, 'chunk.js')).throwsInChunk()
    )
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'index-map-position-before-sections'(dir) {
    const chunk = generateChunkCode(101, 'boom:sections')
    const laterSection = {
      version: 3,
      file: 'chunk.js',
      sources: [url.pathToFileURL(path.join(dir, 'unrelated.js')).href],
      sourcesContent: ['// unrelated'],
      names: [],
      mappings: 'AAAA',
    }
    fs.writeFileSync(
      path.join(dir, 'chunk.js.map'),
      JSON.stringify({
        version: 3,
        sources: [],
        sections: [{ offset: { line: 200, column: 0 }, map: laterSection }],
      })
    )
    fs.writeFileSync(
      path.join(dir, 'chunk.js'),
      chunk.code + '\n//# sourceMappingURL=chunk.js.map'
    )
    const error = throwAndCatch(() =>
      require(path.join(dir, 'chunk.js')).throwsInChunk()
    )
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'index-map-empty-sections'(dir) {
    const chunk = generateChunkCode(101, 'boom:sections')
    fs.writeFileSync(
      path.join(dir, 'chunk.js.map'),
      JSON.stringify({ version: 3, sources: [], sections: [] })
    )
    fs.writeFileSync(
      path.join(dir, 'chunk.js'),
      chunk.code + '\n//# sourceMappingURL=chunk.js.map'
    )
    const error = throwAndCatch(() =>
      require(path.join(dir, 'chunk.js')).throwsInChunk()
    )
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  // Turbopack dev injects a bundler-side source map lookup into the terminal
  // formatter (`setBundlerFindSourceMapImplementation`); the debugger-facing
  // `findSourceMapURLDEV` only consults Node.js.
  async 'bundler-source-map-fallback'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      sourceMap: false,
    })
    const chunk = generateChunkCode(101, 'boom:chunk.js')
    const payload = generateSourceMap(chunk, 'chunk.js.map')
    const chunkURL = url.pathToFileURL(chunkPath).href
    require(
      path.join(nextDist, 'server/patch-error-inspect')
    ).setBundlerFindSourceMapImplementation((sourceURL) =>
      sourceURL === chunkURL ? payload : undefined
    )
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  // The SSR render's `onError` recovers RSC errors by digest and hashes
  // fresh SSR errors with the component stack.
  async 'html-error-handler'(dir) {
    const chunkPath = await writeChunkFixture(
      dir,
      'chunk.js',
      chunkFixtureOptions()
    )
    const mod = await loadChunk(chunkPath)
    const error = throwAndCatch(() => mod.throwsInChunk())
    const wire = serializeError(error, 'Server')
    const revived = await createFlightClientInstance(dir).reviveError(wire)

    const allCapturedErrors = []
    const handleHTMLError = createHTMLErrorHandler(
      true,
      false,
      reactServerErrorsByDigest,
      allCapturedErrors,
      () => {}
    )
    const recoveredDigest = handleHTMLError(revived, {
      componentStack: '\n    at Page (<anonymous>)',
    })
    const freshError = throwAndCatch(() => mod.throwsInChunk())
    const freshDigest = handleHTMLError(freshError, {
      componentStack: '\n    at Layout (<anonymous>)',
    })
    const redirect = new Error('NEXT_REDIRECT')
    redirect.digest = 'NEXT_REDIRECT;push;/target;307;'
    const redirectDigest = handleHTMLError(redirect)
    const largeShell = new Error(
      'This rendered a large document (>128kB) without any Suspense boundaries.'
    )
    const largeShellDigest = handleHTMLError(largeShell)
    const largeShellRSCDigest = handleError(largeShell)
    return {
      hops: [observeError(wire.errorInfo.env, revived)],
      htmlHandler: {
        recoveredDigestForwarded: recoveredDigest === wire.errorInfo.digest,
        freshDigestHashed: /^\d+$/.test(freshDigest.split('@')[0]),
        freshDigestDiffers: freshDigest !== recoveredDigest,
        capturedBoth: allCapturedErrors.length === 3,
        revivedIsUserLandError: isUserLandError(revived),
        redirectDigestForwarded: redirectDigest === redirect.digest,
        largeShellSilenced:
          largeShellDigest === undefined && largeShellRSCDigest === undefined,
      },
    }
  },

  async 'formatted-context-error'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      message: 'createContext is not a function',
    })
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'formatted-hook-error'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      message: 'useState is not a function',
    })
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  // Frames as browsers report them to the overlay endpoint: eval origins
  // and `_next/static` URLs, cleaned up and rewritten by `parseStack`.
  async 'overlay-browser-frames'(dir) {
    const { getOriginalStackFrames } = require(
      path.join(nextDist, 'server/dev/middleware-turbopack')
    )
    const { parseStack } = require(
      path.join(nextDist, 'server/lib/parse-stack')
    )
    const stackText = [
      'Error: boom',
      `    at evil (eval at run (${path.join(dir, 'host.js')}:1:1), <anonymous>:5:9)`,
      '    at page (http://localhost:3000/_next/static/chunks/app/page.js:10:5)',
    ].join('\n')
    const project = {
      async traceSource() {
        return null
      },
      async getSourceMap() {
        return null
      },
    }
    const hop = {
      environmentName: 'browser',
      stack: stackText,
      symbolicated: { frame: null },
      terminal: '(not printed)',
    }
    hop.overlayFrames = (
      await getOriginalStackFrames({
        project,
        projectPath: dir,
        frames: parseStack(stackText, dir),
        isServer: false,
        isEdgeServer: false,
        isAppDirectory: true,
      })
    ).map((entry) =>
      entry.status === 'rejected'
        ? { status: entry.status, reason: String(entry.reason) }
        : entry
    )
    return { hops: [hop] }
  },

  // The browser's Flight client resolves fake frame source maps through
  // `/__nextjs_source-map?filename=...` instead of `findSourceMapURLDEV`;
  // this is that endpoint's server half.
  async 'source-map-endpoint'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    require(chunkPath)
    const spacedDir = path.join(dir, 'my project')
    fs.mkdirSync(spacedDir)
    const spacedChunk = await writeChunkFixture(spacedDir, 'chunk.js')
    require(spacedChunk)

    const { getSourceMapMiddleware } = require(
      path.join(nextDist, 'server/dev/middleware-turbopack')
    )
    const middleware = getSourceMapMiddleware({
      async getSourceMap() {
        return null
      },
    })
    const resolve = (filename) =>
      new Promise((done) => {
        const res = {
          statusCode: 200,
          setHeader() {
            return res
          },
          end(body) {
            done({
              status: res.statusCode,
              hasMap:
                body !== undefined &&
                String(body).includes('"version":3') &&
                String(body).includes('"mappings"'),
            })
          },
        }
        middleware(
          {
            url: `/__nextjs_source-map?filename=${encodeURIComponent(filename)}`,
            method: 'GET',
          },
          res,
          () => done({ status: 'next' })
        )
      })

    const queries = {
      'chunk path': chunkPath,
      'chunk file URL': url.pathToFileURL(chunkPath).href,
      'path with a space': spacedChunk,
      'encoded file URL with a space': url.pathToFileURL(spacedChunk).href,
      'decoded file URL with a space': `file://${spacedChunk}`,
      'unknown file': path.join(dir, 'unknown.js'),
    }
    const endpoint = {}
    for (const [label, filename] of Object.entries(queries)) {
      endpoint[label] = await resolve(filename)
    }
    return {
      hops: [
        {
          environmentName: 'browser',
          stack: '(not observed)',
          symbolicated: { frame: null },
          terminal: '(not printed)',
        },
      ],
      endpoint,
    }
  },

  // The SWC error-code transform stamps framework errors with
  // `__NEXT_ERROR_CODE`, which suffixes the digest.
  async 'error-code-digest'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    Object.defineProperty(error, '__NEXT_ERROR_CODE', {
      value: 'E118',
      enumerable: false,
      configurable: true,
    })
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Server', 'Server']),
    }
  },

  // Two identical throws hash to the same digest; the shared map keeps the
  // first error object, so recovery hands it back for both.
  async 'digest-collision'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const mod = require(chunkPath)
    const errors = []
    for (let i = 0; i < 2; i++) {
      errors.push(throwAndCatch(() => mod.throwsInChunk()))
    }
    const first = serializeError(errors[0], 'Server')
    const second = serializeError(errors[1], 'Server')
    const digests = [first.errorInfo.digest, second.errorInfo.digest]
    return {
      hops: [
        observeError(
          first.errorInfo.env,
          await createFlightClientInstance(dir).reviveError(first)
        ),
      ],
      digests,
      htmlHandler: {
        digestsCollide: digests[0] === digests[1],
        mapKeepsFirstError:
          reactServerErrorsByDigest.get(digests[0]) === errors[0],
      },
    }
  },

  // The browser's Flight client passes a `findSourceMapURL` that returns
  // `/__nextjs_source-map?...` URLs, so fake scripts carry an `http:` source
  // map URL that a debugger fetches through the dev server.
  async 'browser-flight-source-maps'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())

    process.env.__NEXT_DEV_SERVER = 'true'
    globalThis.document = {
      location: { origin: 'http://localhost:3000' },
    }
    const { findSourceMapURL } = require(
      path.join(nextDist, 'client/app-find-source-map-url')
    )
    const { getSourceMapMiddleware } = require(
      path.join(nextDist, 'server/dev/middleware-turbopack')
    )
    const middleware = getSourceMapMiddleware({
      async getSourceMap() {
        return null
      },
    })
    resolveHttpSourceMap = (sourceMapURL) => {
      let payload
      const { pathname, search } = new URL(sourceMapURL)
      middleware(
        { url: pathname + search, method: 'GET' },
        {
          statusCode: 200,
          setHeader() {
            return this
          },
          end(body) {
            try {
              payload = JSON.parse(String(body))
            } catch {
              payload = null
            }
          },
        },
        () => {}
      )
      return payload
    }

    const wire = serializeError(error, 'Server')
    const revived = await createFlightClientInstance(dir, {
      findSourceMapURL,
    }).reviveError(wire)
    return { hops: [observeError(wire.errorInfo.env, revived)] }
  },

  // Serializing an error as a debug value first (e.g. a console argument)
  // caches a structured stack parse that the error serialization then
  // reuses, so even the first hop takes the structured path.
  async 'error-logged-before-thrown'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    serializeValue({ args: [error] }, 'Server')
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  // Browser console logs forwarded to the dev server terminal have their
  // frames mapped server-side.
  async 'browser-log-source-mapping'(dir) {
    const staticDir = path.join(dir, 'static', 'chunks')
    fs.mkdirSync(staticDir, { recursive: true })
    const chunkPath = await writeChunkFixture(staticDir, 'app.js', {
      message: 'boom:browser-log',
    })
    require(chunkPath)
    const generated = await findGeneratedPosition(
      JSON.parse(fs.readFileSync(`${chunkPath}.map`, 'utf8')),
      ORIGINAL_LINE,
      ORIGINAL_COLUMN
    )
    const fakeFrameURL = `about://React/Server/${encodeURI(
      url.pathToFileURL(path.join(dir, 'server-page.js')).href
    )}?0`
    const stackTrace = [
      'Error: client log',
      `    at throwsInChunk (http://localhost:3000/_next/static/chunks/app.js:${generated.line1}:${generated.column1})`,
      '    at injected (chrome-extension://abcdef/content.js:1:1)',
      '    at unknown (http://localhost:3000/_next/static/chunks/other.js:1:1)',
      // A revived server error logged in the browser carries fake frames;
      // forwarding the log sends their sourceURLs as text.
      `    at Page (${fakeFrameURL}:113:11)`,
    ].join('\n')

    const {
      getSourceMappedStackFrames,
      getConsoleLocation,
      withLocation,
    } = require(path.join(nextDist, 'server/dev/browser-logs/source-map'))
    const ctx = {
      bundler: 'turbopack',
      isServer: false,
      isEdgeServer: false,
      isAppDirectory: true,
      project: {
        async traceSource() {
          return null
        },
        async getSourceMap() {
          return null
        },
      },
      projectPath: dir,
    }
    const mapped = await getSourceMappedStackFrames(stackTrace, ctx, dir)
    const decorated = await withLocation(
      { original: ['hello from the browser'], stack: stackTrace },
      ctx,
      dir,
      true
    )
    return {
      hops: [
        {
          environmentName: 'browser',
          stack: stackTrace,
          symbolicated: { frame: null },
          terminal: '(not printed)',
        },
      ],
      browserLogs: {
        kind: mapped.kind,
        frames:
          mapped.frames?.map((frame) => ({
            frameText: frame.frameText,
            hasCodeFrame: frame.codeFrame != null,
          })) ?? null,
        consoleLocation: getConsoleLocation(mapped),
        decorated,
      },
    }
  },

  async 'owner-stack'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Server',
    })
    const wire = serializeError(error, 'Server', pageInfo)
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  async 'owner-stack-cross-environment'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Cache',
    })
    const wire = serializeError(error, 'Cache', pageInfo)
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  // With cache components, the dev render's `environmentName` is a function
  // of the current render stage and returns 'Prerender' while the static
  // stages run, so everything serialized there carries that environment.
  async 'prerender-environment'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js')
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    const wire = serializeError(error, 'Prerender')
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  async 'prerender-owner-stack'(dir) {
    const { pageInfo, error } = await writeOwnerFixture(dir, {
      pageEnvironmentName: 'Prerender',
      layoutEnvironmentName: 'Prerender',
    })
    const wire = serializeError(error, 'Prerender', pageInfo)
    const revived = await createFlightClientInstance(dir).reviveError(wire)
    const hop = observeError(wire.errorInfo.env, revived)
    hop.ownerTasks = await observeOwnerTaskChain(revived)
    return { hops: [hop] }
  },

  async 'ignore-listed-chunk'(dir) {
    const chunkPath = await writeChunkFixture(dir, 'chunk.js', {
      ignoreList: true,
    })
    const error = throwAndCatch(() => require(chunkPath).throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'async-function-frames'(dir) {
    const chunkFileName = 'chunk.js'
    const lines = ['"use strict";']
    while (lines.length < 100) {
      lines.push('/* padding */')
    }
    const throwingLine =
      "async function throwsInChunk() { await 0; throw new Error('boom:async'); }"
    lines.push(throwingLine)
    lines.push('async function outer() { await throwsInChunk(); }')
    lines.push('module.exports = { outer: outer };')
    fs.writeFileSync(
      path.join(dir, `${chunkFileName}.map`),
      JSON.stringify({
        version: 3,
        file: chunkFileName,
        sources: ['original.js'],
        sourcesContent: [ORIGINAL_SOURCE],
        names: [],
        mappings: encodeMappings([
          {
            genLine: 100,
            genCol: throwingLine.indexOf('new Error'),
            srcLine: ORIGINAL_LINE - 1,
            srcCol: ORIGINAL_COLUMN - 1,
          },
          { genLine: 101, genCol: 25, srcLine: 1, srcCol: 0 },
        ]),
      })
    )
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)
    fs.writeFileSync(
      path.join(dir, chunkFileName),
      lines.join('\n') + `\n//# sourceMappingURL=${chunkFileName}.map`
    )
    let error
    try {
      await require(path.join(dir, chunkFileName)).outer()
      throw new Error('expected the fixture to throw')
    } catch (thrown) {
      error = thrown
    }
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'deep-stack'(dir) {
    const chunkFileName = 'chunk.js'
    const lines = ['"use strict";']
    while (lines.length < 100) {
      lines.push('/* padding */')
    }
    lines.push(
      "function recurses(n) { if (n === 0) { throw new Error('boom:deep'); } return recurses(n - 1); }"
    )
    lines.push('module.exports = { recurses: recurses };')
    fs.writeFileSync(path.join(dir, chunkFileName), lines.join('\n'))
    const error = throwAndCatch(() =>
      require(path.join(dir, chunkFileName)).recurses(30)
    )
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },

  async 'webpack-internal-frames'(dir) {
    // Mirrors Webpack's development `eval-source-map` output: each module is
    // eval'd with a `webpack-internal:` sourceURL and an inline source map
    // whose sources use the `webpack://` scheme.
    const chunk = generateChunkCode(101, 'boom:webpack', {
      moduleFormat: 'eval',
    })
    const map = {
      version: 3,
      file: 'page.js',
      sources: ['webpack://_N_E/./app/page.js'],
      sourcesContent: [ORIGINAL_SOURCE],
      names: [],
      mappings: encodeMappings([
        {
          genLine: chunk.line1 - 1,
          genCol: chunk.column1 - 1,
          srcLine: ORIGINAL_LINE - 1,
          srcCol: ORIGINAL_COLUMN - 1,
        },
      ]),
    }
    const code =
      chunk.code +
      '\n//# sourceURL=webpack-internal:///(rsc)/./app/page.js' +
      '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
      Buffer.from(JSON.stringify(map)).toString('base64')
    // eslint-disable-next-line no-eval
    const moduleExports = (0, eval)(code)
    const error = throwAndCatch(() => moduleExports.throwsInChunk())
    return {
      hops: await reviveAcrossEnvironments(dir, error, ['Server', 'Server']),
    }
  },

  async 'eval-with-inline-source-map'(dir) {
    // Mirrors how the Turbopack Node.js HMR client evals updated modules:
    // an explicit `//# sourceURL` with the module id as a query, and the
    // source map inlined as a `data:` URL.
    const chunk = generateChunkCode(101, 'boom:eval', { moduleFormat: 'eval' })
    const chunkPath = path.join(dir, 'chunk.js')
    fs.writeFileSync(chunkPath, chunk.code)
    fs.writeFileSync(path.join(dir, 'original.js'), ORIGINAL_SOURCE)
    const sourceURL = `${url.pathToFileURL(chunkPath).href}?module-id`
    const map = generateSourceMap(chunk, 'chunk.js.map')
    const code =
      chunk.code +
      '\n\n//# sourceURL=' +
      sourceURL +
      '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
      Buffer.from(JSON.stringify(map)).toString('base64')
    // eslint-disable-next-line no-eval
    const moduleExports = (0, eval)(code)
    const error = throwAndCatch(() => moduleExports.throwsInChunk())
    return { hops: await reviveAcrossEnvironments(dir, error, ['Server']) }
  },
}

async function main() {
  const scenarioName = process.argv[2]
  const scenario = scenarios[scenarioName]
  if (scenario === undefined) {
    throw new Error(`unknown scenario: ${scenarioName}`)
  }

  await post('Debugger.enable', { maxScriptsCacheSize: 10_000_000 })

  // Like the dev server's initialization: native bindings load first, then
  // code frame rendering is injected into the error formatter. Without the
  // injection (`next start` has none), the formatter omits code frames.
  await require(path.join(nextDist, 'build/swc')).loadBindings()
  if (!process.env.SCENARIO_SKIP_CODE_FRAMES) {
    require(
      path.join(nextDist, 'server/lib/install-code-frame')
    ).installCodeFrameSupport()
  }
  await post('Runtime.enable')
  // An attached debugger frontend enables async stack tracking, which is
  // what records the `console.createTask` chain at error construction.
  await post('Debugger.setAsyncCallStackDepth', { maxDepth: 64 })

  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fsf-'))
  const result = await scenario(dir)

  // Let trailing `Debugger.scriptParsed` events drain.
  await new Promise((resolve) => setImmediate(resolve))

  result.fakeScripts = parsedScripts.filter(
    (script) =>
      script.url.startsWith('about://React/') ||
      script.url.startsWith(url.pathToFileURL(dir).href)
  )
  for (const script of result.fakeScripts) {
    if (!script.url.startsWith('about://React/')) continue
    const { scriptSource } = await post('Debugger.getScriptSource', {
      scriptId: script.scriptId,
    })
    // The sourceURL and source map URL comments are dropped: they are
    // asserted on separately, and the `?N` counter suffix depends on how
    // many fake functions the consumer created before.
    script.source = scriptSource.replace(/\n\/\/# source.*$/s, '')
    // For the browser consumer the map URL points at the dev server
    // endpoint; resolve it here so the harness can still verify the map.
    if (script.sourceMapURL.startsWith('http:')) {
      script.resolvedSourceMap = resolveHttpSourceMap(script.sourceMapURL)
    }
  }
  result.dir = dir

  process.stdout.write(JSON.stringify(result))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
