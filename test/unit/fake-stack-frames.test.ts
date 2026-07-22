/**
 * Exercises the semantics of React's fake stack frames for revived errors
 * against the real Next.js modules that participate in them, without a
 * bundler or a dev server. See fake-stack-frames/scenario.js for the moving
 * pieces.
 *
 * Each scenario's observations are pinned as an inline snapshot of the whole
 * result — stack text, terminal rendering, debugger symbolication, fake
 * scripts, owner task chains — normalized only where output is
 * machine-specific (paths) or volatile (line numbers of the harness and of
 * Node.js internals, `data:` source map payloads, padding runs). The
 * snapshots encode the current behavior, including its defects, so that any
 * change to the machinery shows up as a diff here.
 */
/* eslint jest/no-standalone-expect: ["error", { "additionalTestBlockFunctions": ["itObservesTaskChains"] }] */

import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const scenarioPath = require.resolve('./fake-stack-frames/scenario.js')
const repoRoot = path.resolve(__dirname, '../..')
const nextDist = path.join(
  path.dirname(require.resolve('next/package.json')),
  'dist'
)

interface SymbolicatedFrame {
  frame: {
    methodName: string
    url: string
    line1: number
    column1: number
  } | null
  script?: { hasSourceMap: boolean } | null
  original?: { source: string; line1: number } | null
}

interface OwnerTask {
  description: string
  top: SymbolicatedFrame | null
}

interface OverlayFrame {
  status: 'fulfilled' | 'rejected'
  reason?: string
  value?: {
    originalStackFrame: {
      file: string
      methodName: string
      line1: number | null
      column1: number | null
      ignored: boolean
    }
    originalCodeFrame: string | null
  }
}

interface Hop {
  environmentName: string
  stack: string
  symbolicated: SymbolicatedFrame
  symbolicatedCaller?: SymbolicatedFrame
  symbolicatedThrow?: SymbolicatedFrame
  symbolicatedModuleFrame?: SymbolicatedFrame
  stackWithoutMessage?: string
  ownerTasks?: OwnerTask[]
  overlayFrames?: OverlayFrame[]
  cause?: Hop
  errors?: Hop[]
  revivedConstructor?: string
  terminal: string
}

interface ScenarioResult {
  hops: Hop[]
  fakeScripts: {
    url: string
    sourceMapURL: string
    source?: string
    resolvedSourceMap?: { version: number } | null
  }[]
  digests?: string[]
  htmlHandler?: Record<string, boolean>
  browserLogs?: {
    kind: string
    frames: { frameText: string; hasCodeFrame: boolean }[] | null
    consoleLocation: string | null
    decorated: string[]
  }
  endpoint?: Record<string, { status: number | string; hasMap: boolean }>
  dir: string
}

/**
 * Known invariant violations, declared by the test that owns the scenario.
 * Entries name the place within the run (e.g. `hop 0 top`, `hop 1 cause`).
 */
interface KnownDefects {
  // Fake `about://React/` frames whose position does not resolve through
  // their script's own source map (the debugger falls back to the fake
  // script's generated position).
  unresolvedFakeFrames?: string[]
  // Terminal output showing a raw `about://React/` URL: when the frame's
  // position falls into a mapping hole, `frameToString` prints the fake
  // sourceURL without devirtualizing it.
  rawTerminalURLs?: string[]
  // Fake scripts (matched by URL substring) whose `http:` source map URL the
  // dev server answers with no content, leaving the debugger unable to map
  // the script at all.
  unmappedFakeScripts?: string[]
}

// `Runtime.getExceptionDetails` only reports the `console.createTask` chain
// on Node.js 24+, so tests observing owner task chains cannot run on the
// older versions CI uses.
const itObservesTaskChains =
  Number(process.versions.node.split('.')[0]) >= 24 ? it : it.skip

function runScenario(
  name: string,
  extraEnv: Record<string, string> = {},
  moduleFormat: 'cjs' | 'esm' = 'cjs',
  knownDefects: KnownDefects = {}
): ScenarioResult {
  const stdout = execFileSync(
    process.execPath,
    ['--enable-source-maps', scenarioPath, name, moduleFormat],
    {
      encoding: 'utf8',
      // Terminal output renders paths relative to the working directory.
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NEXT_DIST: nextDist,
        ...extraEnv,
      },
    }
  )
  const result: ScenarioResult = JSON.parse(stdout)
  fs.rmSync(result.dir, { recursive: true, force: true })
  verifyInvariants(result, knownDefects)
  return result
}

// ---------------------------------------------------------------------------
// Universal invariants
// ---------------------------------------------------------------------------
// Checked on every scenario run, in both directions: a violation the test
// did not declare fails, and a declared defect that stops reproducing
// fails too, so fixing one forces its declaration to be deleted.

function verifyInvariants(
  result: ScenarioResult,
  knownDefects: KnownDefects
): void {
  // Every fake stack frame script must carry an inline, parseable source
  // map — `createFakeFunction` only mints `about://React/` URLs when
  // `findSourceMapURL` returned one.
  const unmappedFakeScripts = new Set(knownDefects.unmappedFakeScripts)
  for (const script of result.fakeScripts) {
    if (!script.url.startsWith('about://React/')) continue
    // The browser consumer's `findSourceMapURL` returns dev server endpoint
    // URLs instead of inline data URLs; the scenario resolves those through
    // the real middleware so the map can still be verified.
    const payload = script.sourceMapURL.startsWith('http:')
      ? script.resolvedSourceMap
      : (expect(script.sourceMapURL).toMatch(/^data:application\/json;base64,/),
        JSON.parse(
          Buffer.from(
            script.sourceMapURL.slice('data:application/json;base64,'.length),
            'base64'
          ).toString('utf8')
        ))
    const declared = [...unmappedFakeScripts].find((substring) =>
      script.url.includes(substring)
    )
    if (declared !== undefined) {
      // A declared unmapped script must keep coming back empty until the
      // defect is fixed.
      expect({ url: script.url, map: payload ?? null }).toEqual({
        url: script.url,
        map: null,
      })
      continue
    }
    expect({ url: script.url, version: payload?.version }).toEqual({
      url: script.url,
      version: 3,
    })
  }
  // Every declared unmapped script must have matched a fake script.
  for (const substring of unmappedFakeScripts) {
    expect(
      result.fakeScripts.some((script) => script.url.includes(substring))
    ).toBe(true)
  }

  const unresolvedFakeFrames = new Set(knownDefects.unresolvedFakeFrames)
  const rawTerminalURLs = new Set(knownDefects.rawTerminalURLs)

  const checkFrame = (
    symbolicated: SymbolicatedFrame | null | undefined,
    at: string
  ) => {
    const frame = symbolicated?.frame
    if (!frame || !frame.url.startsWith('about://React/')) return
    const resolved =
      symbolicated!.original !== null && symbolicated!.original !== undefined
    const expected = !unresolvedFakeFrames.has(at)
    expect({ at, resolved }).toEqual({ at, resolved: expected })
  }

  const visitHop = (hop: Hop, place: string) => {
    checkFrame(hop.symbolicated, `${place} top`)
    checkFrame(hop.symbolicatedCaller, `${place} caller`)
    checkFrame(hop.symbolicatedThrow, `${place} throw`)
    checkFrame(hop.symbolicatedModuleFrame, `${place} module`)
    hop.ownerTasks?.forEach((task) =>
      checkFrame(task.top, `${place} owner ${task.description}`)
    )
    const showsAboutURL = hop.terminal.includes('about://React/')
    const expected = rawTerminalURLs.has(place)
    expect({ at: place, showsAboutURL }).toEqual({
      at: place,
      showsAboutURL: expected,
    })
    if (hop.cause) visitHop(hop.cause, `${place} cause`)
    hop.errors?.forEach((inner, index) =>
      visitHop(inner, `${place} errors[${index}]`)
    )
  }
  result.hops.forEach((hop, index) => visitHop(hop, `hop ${index}`))
}

/**
 * Replaces machine-specific and volatile output with stable placeholders:
 * the scenario's temp directory (in file URL, absolute, and
 * relative-to-either-root spellings) becomes `<tmp>`, the repository root
 * `<repo>`, positions inside the harness and Node.js internals `<pos>`
 * (they shift with every edit or Node.js upgrade), and base64 source map
 * payloads `<map>`.
 */
function createNormalizer(dir: string): (text: string) => string {
  const substitutions: [string, string][] = [
    [url.pathToFileURL(dir).href, 'file://<tmp>'],
    // The endpoint query string carries the percent-encoded filename.
    [encodeURIComponent(dir), '<tmp>'],
    [encodeURIComponent(repoRoot), '<repo>'],
    [path.relative(repoRoot, dir), '<tmp>'],
    [path.relative(dir, repoRoot), '<repo>'],
    [dir, '<tmp>'],
    [url.pathToFileURL(repoRoot).href, 'file://<repo>'],
    [repoRoot, '<repo>'],
  ]
  return (text) => {
    for (const [from, to] of substitutions) {
      text = text.split(from).join(to)
    }
    return (
      text
        .replace(
          /(scenario\.js|react-flight-semantics\.js|flight-client\/index\.js|node:internal\/[\w/]+)(\?\d+)?:\d+:\d+/g,
          '$1$2:<pos>'
        )
        // Fake scripts minted for the harness's own frames pad to the
        // harness's geometry, which shifts with every scenario edit.
        .replace(
          /(scenario\.js\?\d+\n {2}map: [^\n]+\n {2}\| \(\{"[^"]*":_=>)[^\n]*(_\(\)\}\))/g,
          '$1<padding>$2'
        )
        .replace(/data:application\/json;base64,[A-Za-z0-9+/=]+/g, '<map>')
        // The overlay endpoint renders code frames with colors.
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;]*m/g, '')
        // Hashed digests embed the stack text, so their values are
        // machine-specific.
        .replace(/digest: '\d+(@E\d+)?'/g, "digest: '<hash>$1'")
        // Long `../` runs escape the repo root, so their length depends on
        // where the repo sits on the machine.
        .replace(/(?:\.\.\/){3,}/g, '<up>/')
        .replace(/\n{3,}/g, (run) => `<${run.length} newlines>`)
        .replace(/ {8,}/g, (run) => `<${run.length} spaces>`)
        // Node.js 24 collapses duplicate stack lines in `util.inspect`;
        // older versions print every line. Fold both renderings to the
        // same text.
        .replace(
          /\.\.\. collapsed (\d+) duplicate lines matching above \d+ lines \d+ times\.\.\./g,
          '... repeated $1 more times ...'
        )
        .split('\n')
        .reduce<string[]>((lines, line) => {
          const previous = lines[lines.length - 1]
          if (line.trim() !== '' && line === previous) {
            lines.push(line)
            return lines
          }
          let count = 0
          while (
            lines.length >= 2 &&
            lines[lines.length - 1] === lines[lines.length - 2]
          ) {
            lines.pop()
            count++
          }
          if (count > 1) {
            const indent = previous.match(/^\s*/)![0]
            lines.push(`${indent}... repeated ${count} more times ...`)
          } else {
            for (let i = 0; i < count; i++) lines.push(previous)
          }
          lines.push(line)
          return lines
        }, [])
        .join('\n')
    )
  }
}

/**
 * Renders a scenario result as one snapshot-friendly document. Everything
 * observable is included: per hop the revived stack text, the terminal
 * (`util.inspect`) rendering, and the debugger's view of each observed
 * frame; then owner task chains, overlay resolutions, nested cause/errors
 * hops, and the fake scripts the consumer evaled.
 */
function renderScenario(result: ScenarioResult): string {
  const normalize = createNormalizer(result.dir)
  const lines: string[] = []
  const indent = (text: string, prefix = '  ') =>
    text
      .split('\n')
      .map((line) => (prefix + line).trimEnd())
      .join('\n')

  const renderFrame = (symbolicated: SymbolicatedFrame): string => {
    if (symbolicated.frame === null) {
      return 'no frame'
    }
    const { methodName, url: frameURL, line1, column1 } = symbolicated.frame
    let out = `${methodName || '<no name>'} at ${frameURL}:${line1}:${column1}`
    if (symbolicated.script === null) {
      out += '\n  script: not loaded'
    } else if (!symbolicated.script!.hasSourceMap) {
      out += '\n  script: no source map'
    } else if (
      symbolicated.original === null ||
      symbolicated.original === undefined
    ) {
      out += '\n  script: has source map, position unmapped'
    } else {
      out += `\n  original: ${symbolicated.original.source}:${symbolicated.original.line1}`
    }
    return out
  }

  const renderHop = (hop: Hop, label: string) => {
    lines.push(`== ${label} (${hop.environmentName}) ==`)
    lines.push('error.stack (the raw string):')
    lines.push(indent(hop.stack))
    lines.push('terminal (the dev server prints through the patched inspect):')
    lines.push(indent(hop.terminal))
    lines.push(
      'top frame (as an attached debugger resolves it): ' +
        indent(renderFrame(hop.symbolicated)).trim()
    )
    const extraFrames: [string, SymbolicatedFrame | undefined][] = [
      ['caller frame', hop.symbolicatedCaller],
      ['throw frame', hop.symbolicatedThrow],
      ['module frame', hop.symbolicatedModuleFrame],
    ]
    for (const [frameLabel, symbolicated] of extraFrames) {
      if (symbolicated !== undefined) {
        lines.push(`${frameLabel}: ` + indent(renderFrame(symbolicated)).trim())
      }
    }
    if (hop.revivedConstructor !== undefined) {
      lines.push(`constructor: ${hop.revivedConstructor}`)
    }
    if (hop.stackWithoutMessage !== undefined) {
      lines.push('getStackWithoutErrorMessage:')
      lines.push(indent(hop.stackWithoutMessage))
    }
    if (hop.ownerTasks !== undefined) {
      lines.push('owner tasks:')
      for (const task of hop.ownerTasks) {
        lines.push(`  ${task.description}`)
        if (task.top !== null) {
          lines.push(indent(renderFrame(task.top), '    '))
        }
      }
    }
    if (hop.overlayFrames !== undefined) {
      lines.push('overlay frames:')
      for (const frame of hop.overlayFrames) {
        if (frame.status === 'rejected') {
          lines.push(indent(`rejected: ${frame.reason}`))
          continue
        }
        const { originalStackFrame, originalCodeFrame } = frame.value!
        lines.push(
          `  ${originalStackFrame.methodName} at ` +
            `${originalStackFrame.file}:${originalStackFrame.line1}:${originalStackFrame.column1}` +
            (originalStackFrame.ignored ? ' (ignored)' : '')
        )
        if (originalCodeFrame !== null) {
          lines.push(indent(originalCodeFrame, '    | '))
        }
      }
    }
    if (hop.cause !== undefined) {
      renderHop(hop.cause, `${label} cause`)
    }
    hop.errors?.forEach((inner, index) => {
      renderHop(inner, `${label} errors[${index}]`)
    })
  }

  result.hops.forEach((hop, index) => renderHop(hop, `hop ${index}`))

  if (result.browserLogs !== undefined) {
    const { kind, frames, consoleLocation, decorated } = result.browserLogs
    lines.push('== browser log mapping ==')
    lines.push(`  kind: ${kind}`)
    for (const mappedFrame of frames ?? []) {
      lines.push(
        `  ${mappedFrame.frameText.trim()}${mappedFrame.hasCodeFrame ? ' [code frame]' : ''}`
      )
    }
    lines.push(`  console location: ${consoleLocation}`)
    lines.push(`  decorated: ${JSON.stringify(decorated)}`)
  }

  if (result.endpoint !== undefined) {
    lines.push('== /__nextjs_source-map ==')
    for (const [label, response] of Object.entries(result.endpoint)) {
      lines.push(
        `  ${label}: ${response.status}${response.hasMap ? ' with map' : ''}`
      )
    }
  }

  lines.push('== fake scripts ==')
  for (const script of result.fakeScripts) {
    lines.push(script.url)
    lines.push(
      `  map: ${script.sourceMapURL === '' ? '-' : script.sourceMapURL}`
    )
    if (script.source !== undefined) {
      // Padding runs fold before indentation turns them into empty lines.
      const folded = script.source
        // Long `../` runs escape the repo root, so their length depends on
        // where the repo sits on the machine.
        .replace(/(?:\.\.\/){3,}/g, '<up>/')
        .replace(/\n{3,}/g, (run) => `<${run.length} newlines>`)
        .replace(/ {8,}/g, (run) => `<${run.length} spaces>`)
      lines.push(indent(folded, '  | '))
    }
  }

  return normalize(lines.join('\n'))
}

/**
 * Chunk-loading scenarios run in both module formats in one snapshot:
 * frames of CJS chunks carry file paths, frames of ES modules carry
 * (percent-encoded) `file://` URLs, and Node.js keys their source maps
 * through different loader caches — so path-encoding defects and symlink
 * behavior differ between the two.
 */
function renderBothModes(name: string): string {
  return [
    '======== cjs ========',
    renderScenario(runScenario(name)),
    '======== esm ========',
    renderScenario(runScenario(name, {}, 'esm')),
  ].join('\n')
}

describe('react-flight-semantics.js', () => {
  // Token-level comparison, insensitive to formatting: comments, whitespace,
  // quote style, semicolons, and trailing commas.
  function normalize(code: string): string {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s+/g, '')
      .replace(/'/g, '"')
      .replace(/;/g, '')
      .replace(/,\]/g, ']')
      .replace(/,\)/g, ')')
      .replace(/,\}/g, '}')
  }

  function extract(source: string, start: string, end: string): string {
    const from = source.indexOf(start)
    expect(from).not.toBe(-1)
    const to = source.indexOf(end, from)
    expect(to).not.toBe(-1)
    return source.slice(from, to)
  }

  it('matches the vendored React implementation', () => {
    const compiledDir = path.join(
      path.dirname(require.resolve('next/package.json')),
      'src/compiled/react-server-dom-webpack/cjs'
    )
    const server = fs.readFileSync(
      path.join(
        compiledDir,
        'react-server-dom-webpack-server.node.development.js'
      ),
      'utf8'
    )
    const client = fs.readFileSync(
      path.join(
        compiledDir,
        'react-server-dom-webpack-client.node.development.js'
      ),
      'utf8'
    )
    const copies = fs.readFileSync(
      path.join(__dirname, 'fake-stack-frames/react-flight-semantics.js'),
      'utf8'
    )

    const pieces: [string, string, string, string][] = [
      [
        'collectStackTracePrivate',
        server,
        'function collectStackTracePrivate(',
        'function collectStackTrace(',
      ],
      [
        'collectStackTrace',
        server,
        'function collectStackTrace(',
        'function parseStackTracePrivate(',
      ],
      [
        'parseStackTrace',
        server,
        'function parseStackTrace(error, skipFrames) {\n      var existing',
        'function createTemporaryReference(',
      ],
      [
        'devirtualizeURL',
        server,
        'function devirtualizeURL(',
        'function isPromiseCreationInternal(',
      ],
      [
        'filterStackTrace',
        server,
        'function filterStackTrace(',
        'function hasUnfilteredFrame(',
      ],
      [
        'objectName',
        server,
        'function objectName(',
        'function describeKeyForErrorMessage(',
      ],
      [
        'describeKeyForErrorMessage',
        server,
        'function describeKeyForErrorMessage(',
        'function describeValueForErrorMessage(',
      ],
      [
        'describeValueForErrorMessage',
        server,
        'function describeValueForErrorMessage(',
        'function describeElementType(',
      ],
      [
        'describeElementType',
        server,
        'function describeElementType(',
        'function describeObjectForErrorMessage(',
      ],
      [
        'describeObjectForErrorMessage',
        server,
        'function describeObjectForErrorMessage(',
        'function defaultFilterStackFrame(',
      ],
      [
        'serializeByValueID',
        server,
        'function serializeByValueID(',
        'function serializeLazyID(',
      ],
      [
        'serializeErrorValue',
        server,
        'function serializeErrorValue(',
        'function emitErrorChunk(',
      ],
      [
        'emitErrorChunk',
        server,
        'function emitErrorChunk(',
        'function emitImportChunk(',
      ],
      [
        'outlineComponentInfo',
        server,
        'function outlineComponentInfo(',
        'function emitIOInfoChunk(',
      ],
      [
        'createFakeFunction',
        client,
        'function createFakeFunction(',
        'function buildFakeCallStack(',
      ],
      [
        'buildFakeCallStack',
        client,
        'function buildFakeCallStack(',
        'function getRootTask(',
      ],
      [
        'getRootTask',
        client,
        'function getRootTask(',
        'function initializeFakeTask(',
      ],
      [
        'resolveErrorDev',
        client,
        'function resolveErrorDev(',
        'function createFakeFunction(',
      ],
      [
        'initializeFakeTask',
        client,
        'function initializeFakeTask(',
        'function fakeJSXCallSite',
      ],
      [
        'createModel',
        client,
        'function createModel(',
        'function getInferredFunctionApproximate(',
      ],
      [
        'parseModelString',
        client,
        'function parseModelString(',
        'function missingCall(',
      ],
      ['reviveModel', client, 'function reviveModel(', 'function close('],
      [
        'ReactPromise',
        client,
        'function ReactPromise(',
        'function hasGCedResponse(',
      ],
      [
        'createPendingChunk',
        client,
        'function createPendingChunk(',
        'function releasePendingChunk(',
      ],
      [
        'createResolvedModelChunk',
        client,
        'function createResolvedModelChunk(',
        'function createResolvedIteratorResultChunk(',
      ],
      ['getChunk', client, 'function getChunk(', 'function fulfillReference('],
      ['parseModel', client, 'function parseModel(', 'function reviveModel('],
      [
        'initializeDebugChunk',
        client,
        'function initializeDebugChunk(',
        'function initializeModelChunk(',
      ],
      [
        'initializeModelChunk',
        client,
        'function initializeModelChunk(',
        'function initializeModuleChunk(',
      ],
      [
        'resolveLazy',
        client,
        'function resolveLazy(',
        'function transferReferencedDebugInfo(',
      ],
      [
        'filterDebugInfo',
        client,
        'function filterDebugInfo(',
        'function moveDebugInfoFromChunkToInnerValue(',
      ],
      [
        'moveDebugInfoFromChunkToInnerValue',
        client,
        'function moveDebugInfoFromChunkToInnerValue(',
        'function wakeChunk(',
      ],
      [
        'transferReferencedDebugInfo',
        client,
        'function transferReferencedDebugInfo(',
        'function getOutlinedModel(',
      ],
      [
        'getOutlinedModel',
        client,
        'function getOutlinedModel(',
        'function createMap(',
      ],
    ]

    for (const [name, vendoredSource, start, end] of pieces) {
      const vendored = normalize(extract(vendoredSource, start, end))
      const copyStart = copies.indexOf(`function ${name}(`)
      expect(copyStart).not.toBe(-1)
      const rest = copies.slice(copyStart)
      const boundary =
        /\n(?:function |var |const |\/\/ -|module\.exports)/.exec(
          rest.slice(10)
        )
      const copy = normalize(
        boundary === null ? rest : rest.slice(0, boundary.index + 10)
      )
      expect({ name, identical: copy === vendored }).toEqual({
        name,
        identical: true,
      })
    }

    expect(
      normalize(extract(copies, 'frameRegExp =', 'stackTraceCache ='))
    ).toBe(normalize(extract(server, 'frameRegExp =', 'stackTraceCache =')))

    for (const declaration of [
      'supportsCreateTask = !!console.createTask',
      'REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element")',
      'mightHaveStaticConstructor = /\\bclass\\b.*\\bstatic\\b/',
      'isArrayImpl = Array.isArray',
      'ASYNC_ITERATOR = Symbol.asyncIterator',
      'isInitializingDebugInfo = !1',
    ]) {
      expect(client).toContain(declaration)
      expect(copies).toContain(declaration)
    }
    for (const declaration of [
      'stringify = JSON.stringify',
      'jsxChildrenParents = new WeakMap()',
      'jsxPropsParents = new WeakMap()',
      'CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference")',
      'REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref")',
      'REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition")',
    ]) {
      expect(server).toContain(declaration)
      expect(copies).toContain(declaration)
    }
  })
})

describe('fake stack frames', () => {
  // The baseline mechanism: the producer serializes a thrown error's filtered
  // stack, the consumer revives it by constructing the error inside a chain of
  // eval'd fake functions, one per frame, each carrying a `sourceURL` and the
  // source map served by `findSourceMapURLDEV`.
  describe('reviving one error', () => {
    it('revives an error with a source mapped fake stack frame', () => {
      // TODO: the terminal code frame glues the printed properties' opening
      // brace on as a phantom source line (the \`5 | {\` below, and in every
      // code frame that reaches the end of the source).
      expect(renderBothModes('one-hop')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at one-hop (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at one-hop (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Server/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at one-hop (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at one-hop (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Server/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('reproduces the fake script layout byte-for-byte across revivals', () => {
      const result = runScenario('three-hops')
      const reactScripts = result.fakeScripts.filter((script) =>
        script.url.startsWith('about://React/')
      )
      expect(reactScripts).toHaveLength(3)
      // Later revivals parse frames of the previous fake function, whose
      // enclosing `_=>` position reproduces the same padding, so every hop
      // evals a byte-identical script body.
      expect(reactScripts[1].source).toBe(reactScripts[0].source)
      expect(reactScripts[2].source).toBe(reactScripts[0].source)
      // The `_()` call sits at the frame's own position, padded out with
      // newlines and spaces.
      const frame = result.hops[0].symbolicated.frame
      expect(reactScripts[0].source).toBe(
        '({"Object.throwsInChunk":_=>' +
          '\n'.repeat(frame.line1 - 1) +
          ' '.repeat(frame.column1 - 1) +
          '_()})' +
          '\n/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */'
      )
      // The `?N` counter is per consumer, and each hop's consumer creates its
      // first fake function here. A consumer that revived other frames before
      // would count on.
      for (const script of reactScripts) {
        expect(script.url).toMatch(/\?0$/)
      }
    })

    it('reuses fake stack frame scripts for identical frames', () => {
      expect(renderScenario(runScenario('fake-function-cache')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at fake-function-cache (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at fake-function-cache (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at fake-function-cache (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at fake-function-cache (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('creates one fake script per consumer under colliding URLs', () => {
      // Each consumer numbers its fake scripts with its own counter, so both
      // evals produce the same `?0` URL.
      expect(renderScenario(runScenario('fan-out-consumers')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at fan-out-consumers (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at fan-out-consumers (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at fan-out-consumers (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at fan-out-consumers (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  // `filterStackFrameDEV` decides which frames reach the wire.
  describe('which frames serialize', () => {
    it('serializes no frames for code in node_modules', () => {
      expect(renderScenario(runScenario('node-modules-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at node-modules-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at node-modules-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       == fake scripts ==
       file://<tmp>/node_modules/some-pkg/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -"
      `)
    })

    it('serializes no frames for chunks in directories named like node_modules', () => {
      // The stack frame filter matches `node_modules` as a substring.
      // TODO: match whole path segments so project paths containing the
      // substring keep their frames.
      expect(renderBothModes('node-modules-substring-in-project-path'))
        .toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at node-modules-substring-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at node-modules-substring-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       == fake scripts ==
       file://<tmp>/my_node_modules_backup/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at node-modules-substring-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at node-modules-substring-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       == fake scripts ==
       file://<tmp>/my_node_modules_backup/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -"
      `)
    })

    it('serializes no frames for chunks whose source map ignore-lists everything', () => {
      expect(renderScenario(runScenario('ignore-listed-chunk')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at ignore-listed-chunk (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at ignore-listed-chunk (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -"
      `)
    })

    it('keeps frames of chunks whose source map ignore-lists only other sources', () => {
      expect(renderScenario(runScenario('partial-ignore-list')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:partial
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at partial-ignore-list (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:partial
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at partial-ignore-list (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:34
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('drops `new Promise` frames', () => {
      expect(renderScenario(runScenario('new-promise-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at new-promise-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at throwsInChunk (<tmp>/original.js:3:9)
             at error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at new-promise-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  // How different callsites serialize and revive.
  describe('frame shapes', () => {
    it('keeps a leading space on the method name of async frames', () => {
      // React strips the `async ` marker with `name.slice(5)`, which leaves
      // the space, and the fake function's name keeps it.
      // TODO: strip the marker without leaving a leading space in the name.
      expect(renderScenario(runScenario('async-function-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:async
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:49)
             at  Object.outer (about://React/Server/file://<tmp>/chunk.js?1:102:26)
             at  async-function-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:async
             at throwsInChunk (<tmp>/original.js:3:9)
             at  Object.outer (<tmp>/original.js:2:1)
             at  async-function-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:49
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"throwsInChunk":_=><100 newlines><48 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | ({" Object.outer":_=><101 newlines><25 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('preserves constructor frame names', () => {
      expect(renderScenario(runScenario('constructor-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:constructor
             at new Boom (about://React/Server/file://<tmp>/chunk.js?0:114:15)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at constructor-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:constructor
             at new Boom (<tmp>/original.js:4:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at constructor-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           2 | export class Boom {
           3 |   constructor() {
         > 4 |     throw new Error('boom:constructor')
             |<11 spaces>^
           5 |   }
           6 | }
           7 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): new Boom at about://React/Server/file://<tmp>/chunk.js?0:114:15
           original: file://<tmp>/original.js:4
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"new Boom":_=><113 newlines><14 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('revives native frames under <anonymous> at the fake script position', () => {
      // Native frames serialize without a filename or position, so the fake
      // frame's position is the `_()` call inside the one-line fake script.
      expect(renderScenario(runScenario('native-and-builtin-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at Array.map (<anonymous>:1:18)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at native-and-builtin-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at throwsInChunk (<tmp>/original.js:3:9)
             at Array.map (<anonymous>:1:18)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at native-and-builtin-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('preserves the frame count of deep stacks', () => {
      // The dev server raises `Error.stackTraceLimit` to 50; each recursive
      // frame is revived through the same cached fake function.
      expect(renderScenario(runScenario('deep-stack'))).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:deep
             at recurses (file://<tmp>/chunk.js:101:45)
             at recurses (file://<tmp>/chunk.js:101:78)
             ... repeated 28 more times ...
             at Object.recurses (file://<tmp>/chunk.js:101:78)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at deep-stack (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:deep
             at recurses (<tmp>/chunk.js:101:45)
             at recurses (<tmp>/chunk.js:101:78)
             ... repeated 28 more times ...
             at Object.recurses (<tmp>/chunk.js:101:78)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at deep-stack (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): recurses at file://<tmp>/chunk.js:101:45
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.js
         map: -
       file://<tmp>/chunk.js
         map: -
       file://<tmp>/chunk.js
         map: -"
      `)
    })

    it("splits the eval origin of frames of eval'd scripts without a sourceURL", () => {
      // React's stack frame regex matches the method name greedily, so the
      // `eval at <fn> (` prefix of the eval origin ends up in the method name
      // and the filename is only the origin's tail.
      // TODO: parse the eval origin into the filename, not the method name.
      expect(renderScenario(runScenario('anonymous-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:anonymous
             at Object.throwsInChunk (eval at anonymous-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>),%20%3Canonymous%3E:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at anonymous-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:anonymous
             at Object.throwsInChunk (file://file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at anonymous-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk (eval at anonymous-frames at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>),%20%3Canonymous%3E:101:34
           script: no source map
       == fake scripts ==
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -"
      `)
    })

    it('revives module-evaluation frames', () => {
      // The fixture's map has a single mapping, and lookups resolve to the
      // nearest preceding entry.
      expect(renderBothModes('module-evaluation-throw')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:evaluation
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at Object.<anonymous> (about://React/Server/file://<tmp>/chunk.js?1:115:1)
             at loadChunk (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at module-evaluation-throw (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:evaluation
             at throwsInChunk (<tmp>/original.js:3:9)
             at Object.<anonymous> (<tmp>/original.js:5:1)
             at loadChunk (test/unit/fake-stack-frames/scenario.js:<pos>)
             at module-evaluation-throw (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:evaluation')
             |<9 spaces>^
           4 | }
           5 | throwsInChunk()
           6 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       module frame: Object.<anonymous> at about://React/Server/file://<tmp>/chunk.js?1:115:1
           original: file://<tmp>/original.js:5
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | ({"Object.<anonymous>":_=><114 newlines>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:evaluation
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (about://React/Server/file://<tmp>/chunk.mjs?1:105:1)
             at  loadChunk (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  module-evaluation-throw (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:evaluation
             at throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (<tmp>/original.js:5:1)
             at  loadChunk (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  module-evaluation-throw (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:evaluation')
             |<9 spaces>^
           4 | }
           5 | throwsInChunk()
           6 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       module frame: <anonymous> at about://React/Server/file://<tmp>/chunk.mjs?1:105:1
           original: file://<tmp>/original.js:5
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.mjs?1
         map: <map>
         | ({"<anonymous>":_=><104 newlines>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves every frame of stacks that span multiple chunks', () => {
      expect(renderScenario(runScenario('multiple-chunks')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk-b.js
             at throwsInChunk (about://React/Cache/file://<tmp>/chunk-b.js?0:113:11)
             at Object.callsThrough (about://React/Cache/file://<tmp>/chunk-a.js?1:114:38)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at multiple-chunks (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk-b.js
             at throwsInChunk (<tmp>/original.js:3:9)
             at Object.callsThrough (<tmp>/original.js:4:23)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at multiple-chunks (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk-b.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Cache/file://<tmp>/chunk-b.js?0:113:11
           original: file://<tmp>/original.js:3
       caller frame: Object.callsThrough at about://React/Cache/file://<tmp>/chunk-a.js?1:114:38
           original: file://<tmp>/original.js:4
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk-b.js
             at throwsInChunk (about://React/Cache/file://<tmp>/chunk-b.js?0:113:11)
             at Object.callsThrough (about://React/Cache/file://<tmp>/chunk-a.js?1:114:38)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at multiple-chunks (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk-b.js
             at throwsInChunk (<tmp>/original.js:3:9)
             at Object.callsThrough (<tmp>/original.js:4:23)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at multiple-chunks (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk-b.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Cache/file://<tmp>/chunk-b.js?0:113:11
           original: file://<tmp>/original.js:3
       caller frame: Object.callsThrough at about://React/Cache/file://<tmp>/chunk-a.js?1:114:38
           original: file://<tmp>/original.js:4
       == fake scripts ==
       file://<tmp>/chunk-a.js
         map: chunk-a.js.map
       file://<tmp>/chunk-b.js
         map: chunk-b.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk-b.js?0
         map: <map>
         | ({"throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Cache/file://<tmp>/chunk-a.js?1
         map: <map>
         | ({"Object.callsThrough":_=><113 newlines><37 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk-b.js?0
         map: <map>
         | ({"throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Cache/file://<tmp>/chunk-a.js?1
         map: <map>
         | ({"Object.callsThrough":_=><113 newlines><37 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('revives message lines that look like stack frames as frames', () => {
      // The message survives intact, including its frame-shaped last line, but
      // React's frame regex also matches that line, so the revived error
      // additionally gets a fake `phantom` frame. Its position is the `_()`
      // call inside the fake script: the phantom's 1:1 position takes the
      // `line < 1` layout, which cannot represent the original position. The
      // terminal formatter then re-parses the message's line as a frame too,
      // so it prints three phantoms: the message text, its rewrite (as a
      // root-escaping relative path), and the revived fake frame.
      // TODO: frame-shaped message lines should not revive or print as
      // extra frames.
      expect(renderScenario(runScenario('multi-line-message')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: first line
         second line
             at phantom (file:///not-a-frame.js:1:1)
             at phantom (file:///not-a-frame.js:1:16)
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at multi-line-message (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: first line
         second line
             at phantom (file:///not-a-frame.js:1:1)
             at phantom (<up>/not-a-frame.js:1:1)
             at phantom (<up>/not-a-frame.js:1:16)
             at throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at multi-line-message (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): phantom at file:///not-a-frame.js:1:1
           script: no source map
       throw frame: throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       getStackWithoutErrorMessage:
         second line
             at phantom (file:///not-a-frame.js:1:1)
             at phantom (file:///not-a-frame.js:1:16)
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at multi-line-message (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  // What the error object itself carries across the boundary.
  describe('error shapes', () => {
    it('applies a custom error name to the revived stack', () => {
      // `resolveErrorDev` assigns the name after constructing the error, and
      // V8 formats the stack with the current name on first access.
      expect(renderScenario(runScenario('custom-error-name')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         CustomError: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at custom-error-name (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error [CustomError]: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at custom-error-name (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('replaces empty messages with the fallback message', () => {
      expect(renderScenario(runScenario('empty-message')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: An error occurred in the Server Components render but no message was provided
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at empty-message (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: An error occurred in the Server Components render but no message was provided
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at empty-message (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('revives thrown non-Error values with a machinery-only stack', () => {
      // `emitErrorChunk` serializes non-Error values with an empty stack, so
      // the revived error's stack has only the revival machinery below it,
      // and the terminal formatter collapses it entirely.
      expect(renderScenario(runScenario('thrown-string')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:string
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:string
             at ignore-listed frames {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.resolveErrorDev at <tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>
           script: not loaded
       == fake scripts ==
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -"
      `)
    })

    it('describes thrown non-Error objects in the message', () => {
      expect(renderScenario(runScenario('thrown-object')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: {reason: "boom", code: 7}
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: {reason: "boom", code: 7}
             at ignore-listed frames {
           environmentName: 'Server',
           digest: '<hash>@E394'
         }
       top frame (as an attached debugger resolves it): Object.resolveErrorDev at <tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>
           script: not loaded
       == fake scripts ==
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -"
      `)
    })

    it('revives the cause with its own fake stack', () => {
      // Errors crossing as values (`serializeErrorValue`) carry no digest.
      expect(renderScenario(runScenario('error-with-cause')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:outer
             at Object.throwsOuter (about://React/Server/file://<tmp>/chunk.js?2:127:15)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-with-cause (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:outer
             at Object.throwsOuter (<tmp>/original.js:9:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-with-cause (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
            7 |     throwsCause()
            8 |   } catch (cause) {
         >  9 |     throw new Error('boom:outer', { cause })
              |<11 spaces>^
           10 |   }
           11 | }
           12 | {
           environmentName: 'Server',
           digest: '<hash>',
           [cause]: Error: boom:cause
       <8 spaces>at throwsCause (<tmp>/original.js:3:9)
       <8 spaces>at Object.throwsOuter (<tmp>/original.js:7:5)
       <8 spaces>at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at error-with-cause (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsCause() {
           > 3 |   throw new Error('boom:cause')
       <8 spaces>|<9 spaces>^
             4 | }
             5 | export function throwsOuter() {
             6 |   try { {
             environmentName: 'Server'
           }
         }
       top frame (as an attached debugger resolves it): Object.throwsOuter at about://React/Server/file://<tmp>/chunk.js?2:127:15
           original: file://<tmp>/original.js:9
       == hop 0 cause (Server) ==
       error.stack (the raw string):
         Error: boom:cause
             at throwsCause (about://React/Server/file://<tmp>/chunk.js?0:121:11)
             at Object.throwsOuter (about://React/Server/file://<tmp>/chunk.js?1:125:9)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-with-cause (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at initializeModelChunk (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:cause
             at throwsCause (<tmp>/original.js:3:9)
             at Object.throwsOuter (<tmp>/original.js:7:5)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-with-cause (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsCause() {
         > 3 |   throw new Error('boom:cause')
             |<9 spaces>^
           4 | }
           5 | export function throwsOuter() {
           6 |   try { {
           environmentName: 'Server'
         }
       top frame (as an attached debugger resolves it): throwsCause at about://React/Server/file://<tmp>/chunk.js?0:121:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<118 newlines>({"throwsCause":
         | _=>
         | <10 spaces>_()})
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<121 newlines>({"Object.throwsOuter":
         | _=>
         |
         | <8 spaces>_()})
       about://React/Server/file://<tmp>/chunk.js?2
         map: <map>
         | ({"Object.throwsOuter":_=><126 newlines><14 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('round-trips the model value encodings through a cause', () => {
      // `$`-prefixed strings escape, and negative zero, infinities, and NaN
      // use the renderer's encodings — the same rules that protect function
      // names and native-frame positions inside serialized stacks.
      expect(renderScenario(runScenario('cause-value-encodings')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:outer
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-value-encodings (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:outer
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-value-encodings (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>',
           [cause]: Error: boom:chunk.js
       <8 spaces>at Object.throwsInChunk (<tmp>/original.js:3:9)
       <8 spaces>at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at cause-value-encodings (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
       <8 spaces>|<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Server',
             [cause]: {
       <8 spaces>reference: '$100',
       <8 spaces>negativeZero: -0,
       <8 spaces>infinite: Infinity,
       <8 spaces>notANumber: NaN
             }
           }
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       == hop 0 cause (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-value-encodings (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at initializeModelChunk (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-value-encodings (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           [cause]: {
             reference: '$100',
             negativeZero: -0,
             infinite: Infinity,
             notANumber: NaN
           }
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<110 newlines>({"Object.throwsInChunk":
         | _=>
         | <10 spaces>_()})"
      `)
    })

    it('revives nested cause chains down to primitive causes', () => {
      expect(renderScenario(runScenario('nested-cause-chain')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:outer
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at nested-cause-chain (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:outer
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at nested-cause-chain (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>',
           [cause]: Error: boom:chunk.js
       <8 spaces>at Object.throwsInChunk (<tmp>/original.js:3:9)
       <8 spaces>at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at nested-cause-chain (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
       <8 spaces>|<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Server',
             [cause]: 'root cause'
           }
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       == hop 0 cause (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at nested-cause-chain (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at initializeModelChunk (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at nested-cause-chain (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           [cause]: 'root cause'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<110 newlines>({"Object.throwsInChunk":
         | _=>
         | <10 spaces>_()})"
      `)
    })

    it('revives causes under the environment they carry', () => {
      expect(renderScenario(runScenario('cause-across-environments')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:outer
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-across-environments (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:outer
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-across-environments (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>',
           [cause]: Error: boom:chunk.js
       <8 spaces>at Object.throwsInChunk (<tmp>/original.js:3:9)
       <8 spaces>at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at cause-across-environments (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
       <8 spaces>|<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache'
           }
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       == hop 0 cause (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-across-environments (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModel (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at initializeModelChunk (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at cause-across-environments (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('revives AggregateError errors with their own fake stacks', () => {
      expect(renderScenario(runScenario('aggregate-error')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         AggregateError: boom:aggregate
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at aggregate-error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         AggregateError: boom:aggregate
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at aggregate-error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>',
           [errors]: [
             Error: boom:chunk.js
       <10 spaces>at throwsInChunk (<tmp>/original.js:3:9)
       <10 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at aggregate-error (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at main (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>1 | // original source
       <8 spaces>2 | export function throwsInChunk() {
             > 3 |   throw new Error("boom:chunk.js")
       <10 spaces>|<9 spaces>^
       <8 spaces>4 | }
       <8 spaces>5 | {
       <8 spaces>environmentName: 'Server'
             },
             Error: boom:chunk.js
       <10 spaces>at throwsInChunk (<tmp>/original.js:3:9)
       <10 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at aggregate-error (test/unit/fake-stack-frames/scenario.js:<pos>)
       <10 spaces>at main (test/unit/fake-stack-frames/scenario.js:<pos>)
       <8 spaces>1 | // original source
       <8 spaces>2 | export function throwsInChunk() {
             > 3 |   throw new Error("boom:chunk.js")
       <10 spaces>|<9 spaces>^
       <8 spaces>4 | }
       <8 spaces>5 | {
       <8 spaces>environmentName: 'Server'
             }
           ]
         }
       top frame (as an attached debugger resolves it): <anonymous> at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
           script: no source map
       constructor: AggregateError
       == hop 0 errors[0] (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at aggregate-error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at initializeModelChunk (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at throwsInChunk (<tmp>/original.js:3:9)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at aggregate-error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == hop 0 errors[1] (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at aggregate-error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at initializeModelChunk (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at throwsInChunk (<tmp>/original.js:3:9)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at aggregate-error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<110 newlines>({"throwsInChunk":
         | _=>
         | <10 spaces>_()})"
      `)
    })
  })

  // `createReactServerErrorHandler` runs before every serialization and
  // `createHTMLErrorHandler` on the SSR side; digests decide dedup identity and
  // whether the stack materializes before React parses it.
  describe('digests and the Next.js error handlers', () => {
    it('parses the structured stack trace for errors logged before thrown', () => {
      // Serializing an error as a debug value (e.g. a console argument)
      // caches a structured stack parse that the error serialization reuses,
      // flipping even the first hop off the materialized-string path.
      expect(renderScenario(runScenario('error-logged-before-thrown')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-logged-before-thrown (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-logged-before-thrown (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<110 newlines>({"Object.throwsInChunk":
         | _=>
         | <10 spaces>_()})"
      `)
    })

    it('parses the structured stack trace for errors that carry a digest', () => {
      // Framework errors skip the digest hash, so the stack is never
      // materialized and the first serialization parses V8's structured stack
      // trace. Its real enclosing function positions produce the other fake
      // script layout, with the banner comment first.
      expect(renderScenario(runScenario('predigested-error')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at predigested-error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at predigested-error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: 'NEXT_REDIRECT;push;/target;307;'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<110 newlines>({"Object.throwsInChunk":
         | _=>
         | <10 spaces>_()})"
      `)
    })

    it('serializes the digest before formatServerError rewrites the message', () => {
      // The wire carries the rewritten multi-line message, but the digest
      // hashed the original message and stack.
      expect(renderScenario(runScenario('formatted-server-error')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: Class extends value undefined is not a constructor or null

         This might be caused by a React Class Component being rendered in a Server Component, React Class Components only works in Client Components. Read more: https://nextjs.org/docs/messages/class-component-in-server-component
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at formatted-server-error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: Class extends value undefined is not a constructor or null

         This might be caused by a React Class Component being rendered in a Server Component, React Class Components only works in Client Components. Read more: https://nextjs.org/docs/messages/class-component-in-server-component
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at formatted-server-error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("Class extends value undefined is not a constructor or null")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('rewrites createContext errors after the digest', () => {
      expect(renderScenario(runScenario('formatted-context-error')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at formatted-context-error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at formatted-context-error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("createContext is not a function")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('rewrites client hook errors after the digest', () => {
      expect(renderScenario(runScenario('formatted-hook-error')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at formatted-hook-error (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at formatted-hook-error (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("useState is not a function")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('recovers RSC errors by digest in the HTML error handler', () => {
      const result = runScenario('html-error-handler')
      expect(result.htmlHandler).toEqual({
        recoveredDigestForwarded: true,
        freshDigestHashed: true,
        freshDigestDiffers: true,
        capturedBoth: true,
        revivedIsUserLandError: true,
        redirectDigestForwarded: true,
        largeShellSilenced: true,
      })
    })
  })

  // `findSourceMapURLDEV` (for the debugger) and the terminal formatter both
  // resolve through Node.js' source map cache; the map's shape decides what
  // survives.
  describe('resolving source maps', () => {
    it('splits the consumers on sparse mappings', () => {
      // A map covering only the throw itself: the debugger resolves the
      // caller frame to the nearest preceding mapping, the terminal falls
      // back to the raw URL.
      // TODO: the terminal should fall back to the frame's original URL,
      // not print the fake sourceURL.
      expect(
        renderScenario(
          runScenario('sparse-mappings', {}, 'cjs', {
            rawTerminalURLs: ['hop 0'],
          })
        )
      ).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:sparse
             at throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:121:11)
             at Object.callsThrough (about://React/Server/file://<tmp>/chunk.js?1:124:12)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at sparse-mappings (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:sparse
             at throwsInChunk (<tmp>/original.js:3:9)
             at Object.callsThrough (about://React/Server/file://<tmp>/chunk.js?1:124:12)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at sparse-mappings (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:sparse')
             |<9 spaces>^
           4 | }
           5 | export function callsThrough() {
           6 |   return throwsInChunk() {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:121:11
           original: file://<tmp>/original.js:3
       caller frame: Object.callsThrough at about://React/Server/file://<tmp>/chunk.js?1:124:12
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"throwsInChunk":_=><120 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | ({"Object.callsThrough":_=><123 newlines><11 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves index source maps shaped like Turbopack emits them', () => {
      expect(renderBothModes('index-source-map')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       ======== esm ========
       == hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Cache/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Cache/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves frames mapped by a later section of an index source map', () => {
      expect(renderScenario(runScenario('multi-section-index-map')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:sections
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at multi-section-index-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:sections
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at multi-section-index-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:34
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves frames mapped by the first section of an index source map', () => {
      expect(renderScenario(runScenario('index-map-first-section')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:sections
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-map-first-section (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:sections
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-map-first-section (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:34
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('keeps frames positioned before every index map section', () => {
      // TODO: unmapped positions should fall back to the frame's original
      // URL in both the debugger and the terminal.
      expect(
        renderScenario(
          runScenario('index-map-position-before-sections', {}, 'cjs', {
            unresolvedFakeFrames: ['hop 0 top'],
            rawTerminalURLs: ['hop 0'],
          })
        )
      ).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:sections
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-map-position-before-sections (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:sections
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-map-position-before-sections (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:34
           script: has source map, position unmapped
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('keeps frames of chunks whose index source map has no sections', () => {
      // TODO: unmapped positions should fall back to the frame's original
      // URL in both the debugger and the terminal.
      expect(
        renderScenario(
          runScenario('index-map-empty-sections', {}, 'cjs', {
            unresolvedFakeFrames: ['hop 0 top'],
            rawTerminalURLs: ['hop 0'],
          })
        )
      ).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:sections
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-map-empty-sections (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:sections
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-map-empty-sections (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:34
           script: has source map, position unmapped
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('serves relative section sources that a debugger cannot resolve', () => {
      // Node.js resolves top-level `sources` against the source map's location
      // but leaves section sources untouched, and the fake script's `data:`
      // source map provides no location to resolve them against.
      // TODO: serve section sources a debugger can resolve.
      expect(renderBothModes('index-source-map-relative-sources'))
        .toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map-relative-sources (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map-relative-sources (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Server/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map-relative-sources (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at index-source-map-relative-sources (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Server/file://<tmp>/chunk.mjs?0:103:11
           original: original.js:3
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('does not resolve spec-conformant index source maps', () => {
      // Node.js fails to cache index source maps without a top-level `sources`
      // array, which the source map spec requires index maps to omit.
      // TODO: spec-conformant index maps should resolve (upstream Node.js).
      expect(renderBothModes('spec-index-source-map')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (file://<tmp>/chunk.js:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at spec-index-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/chunk.js:113:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at spec-index-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/chunk.js:113:11
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.js
         map: -
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (file://<tmp>/chunk.mjs:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at spec-index-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/chunk.mjs:103:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at spec-index-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at file://<tmp>/chunk.mjs:103:11
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.mjs
         map: -"
      `)
    })

    it('does not resolve frames of scripts with an invalid source map', () => {
      expect(renderBothModes('invalid-source-map')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (file://<tmp>/chunk.js:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at invalid-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/chunk.js:113:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at invalid-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/chunk.js:113:11
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.js
         map: -
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (file://<tmp>/chunk.mjs:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at invalid-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/chunk.mjs:103:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at invalid-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at file://<tmp>/chunk.mjs:103:11
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.mjs
         map: -"
      `)
    })

    it('falls back to the plain file URL for scripts without a source map', () => {
      expect(renderBothModes('missing-source-map')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (file://<tmp>/chunk.js:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at missing-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/chunk.js:113:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at missing-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/chunk.js:113:11
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.js
         map: -
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (file://<tmp>/chunk.mjs:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at missing-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/chunk.mjs:103:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at missing-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at file://<tmp>/chunk.mjs:103:11
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.mjs
         map: -"
      `)
    })

    it("resolves frames of eval'd scripts with inline source maps", () => {
      expect(renderScenario(runScenario('eval-with-inline-source-map')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:eval
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?module-id?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at eval-with-inline-source-map (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:eval
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at eval-with-inline-source-map (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?module-id?0:101:34
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js?module-id
         map: data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2h1bmsuanMiLCJzb3VyY2VzIjpbIm9yaWdpbmFsLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIG9yaWdpbmFsIHNvdXJjZVxuZXhwb3J0IGZ1bmN0aW9uIHRocm93c0luQ2h1bmsoKSB7XG4gIHRocm93IG5ldyBFcnJvcignYm9vbScpXG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztpQ0FFUSJ9
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?module-id?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves chunks whose files were deleted after loading', () => {
      // Node.js caches source maps in memory when the chunk is loaded.
      expect(renderBothModes('chunk-deleted-after-require'))
        .toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-deleted-after-require (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-deleted-after-require (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Server/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-deleted-after-require (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-deleted-after-require (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Server/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves errors from an edited chunk file with the stale source map', () => {
      // Like webpack HMR replacing a file: Node.js re-reads the map after
      // the module cache is busted, but `findSourceMapURLDEV` still serves
      // the first map for the unchanged URL.
      // TODO: `findSourceMapURLDEV` should refresh its cache when the file
      // changes.
      expect(renderScenario(runScenario('chunk-file-edited')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:edited
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-file-edited (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:edited
             at Object.throwsInChunk (<tmp>/original.js:2:1)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-file-edited (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
         > 2 | export function throwsInChunk() {
             | ^
           3 |   throw new Error('boom')
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:34
           original: file://<tmp>/original.js:2
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:edited
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-file-edited (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:edited
             at Object.throwsInChunk (<tmp>/original.js:2:1)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at chunk-file-edited (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
         > 2 | export function throwsInChunk() {
             | ^
           3 |   throw new Error('boom')
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:101:34
           original: file://<tmp>/original.js:2
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves query-busted ES module reloads with their own maps', () => {
      // The `?v=2` URL is a distinct cache key end to end, so unlike
      // same-URL updates, every version resolves through its own map.
      expect(renderScenario(runScenario('esm-query-busted-reload')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:reloaded
             at Module.throwsInChunk (about://React/Server/file://<tmp>/chunk.mjs?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at esm-query-busted-reload (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:reloaded
             at Module.throwsInChunk (<tmp>/original.js:2:1)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at esm-query-busted-reload (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
         > 2 | export function throwsInChunk() {
             | ^
           3 |   throw new Error('boom')
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Server/file://<tmp>/chunk.mjs?0:101:34
           original: file://<tmp>/original.js:2
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:reloaded
             at Module.throwsInChunk (about://React/Server/file://<tmp>/chunk.mjs?v=2?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at esm-query-busted-reload (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:reloaded
             at Module.throwsInChunk (<tmp>/original.js:3:1)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at esm-query-busted-reload (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             | ^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Server/file://<tmp>/chunk.mjs?v=2?0:101:34
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/chunk.mjs?v=2
         map: chunk.mjs.map
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.mjs?v=2?0
         map: <map>
         | ({"Module.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves errors from a replaced eval with the stale source map', () => {
      // The first update's map points to line 2, the second update's to
      // line 3. Node.js replaces its cached map on the second eval, but
      // reviving the first error cached the first map in `findSourceMapURLDEV`
      // under the shared sourceURL, so the second error resolves through the
      // stale map.
      // TODO: `findSourceMapURLDEV` should serve the latest map for reused
      // sourceURLs.
      expect(renderScenario(runScenario('repeated-hmr-updates')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:update
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?module-id?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at repeated-hmr-updates (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:update
             at Object.throwsInChunk (<tmp>/original.js:2:1)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at repeated-hmr-updates (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
         > 2 | export function throwsInChunk() {
             | ^
           3 |   throw new Error('boom')
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?module-id?0:101:34
           original: file://<tmp>/original.js:2
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:update
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?module-id?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at repeated-hmr-updates (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:update
             at Object.throwsInChunk (<tmp>/original.js:2:1)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at repeated-hmr-updates (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
         > 2 | export function throwsInChunk() {
             | ^
           3 |   throw new Error('boom')
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?module-id?0:101:34
           original: file://<tmp>/original.js:2
       == fake scripts ==
       file://<tmp>/chunk.js?module-id
         map: data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2h1bmsuanMiLCJzb3VyY2VzIjpbIm9yaWdpbmFsLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIG9yaWdpbmFsIHNvdXJjZVxuZXhwb3J0IGZ1bmN0aW9uIHRocm93c0luQ2h1bmsoKSB7XG4gIHRocm93IG5ldyBFcnJvcignYm9vbScpXG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztpQ0FDQSJ9
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?module-id?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/chunk.js?module-id
         map: data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2h1bmsuanMiLCJzb3VyY2VzIjpbIm9yaWdpbmFsLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIG9yaWdpbmFsIHNvdXJjZVxuZXhwb3J0IGZ1bmN0aW9uIHRocm93c0luQ2h1bmsoKSB7XG4gIHRocm93IG5ldyBFcnJvcignYm9vbScpXG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztpQ0FFQSJ9
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?module-id?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves terminal frames through the bundler source map fallback', () => {
      // Turbopack dev injects a bundler lookup into the terminal formatter;
      // the debugger-facing `findSourceMapURLDEV` only consults Node.js, so
      // the fake script gets no source map while the terminal resolves.
      // TODO: `findSourceMapURLDEV` should consult the bundler fallback too,
      // so debuggers resolve these frames.
      expect(renderScenario(runScenario('bundler-source-map-fallback')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (file://<tmp>/chunk.js:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at bundler-source-map-fallback (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/chunk.js:113:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at bundler-source-map-fallback (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/chunk.js:113:11
           script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/chunk.js
         map: -"
      `)
    })

    it('ignore-lists frames whose original source is in node_modules', () => {
      expect(renderScenario(runScenario('map-source-in-node-modules')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:vendored
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at map-source-in-node-modules (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:vendored
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at map-source-in-node-modules (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/node_modules/lib/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  // Frame URLs round-trip through `encodeURI` (into the fake script's
  // sourceURL) and `decodeURI` (devirtualization on the next hop); CJS frames
  // carry raw paths and ES module frames carry percent-encoded URLs, so the two
  // diverge on special characters.
  describe('paths and encodings', () => {
    it('resolves every revival for chunk paths that percent-encoding does not change', () => {
      // Revived errors carry the environment they were first serialized in.
      // Every hop crosses into a different consumer, and each consumer evals
      // its own fake stack frame script.
      expect(renderBothModes('three-hops')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == hop 2 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-2/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-2/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       ======== esm ========
       == hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Cache/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Cache/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       == hop 2 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Cache/file://<tmp>/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-2/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at three-hops (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/chunk.mjs?0:103:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-2/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    // For CJS chunks, the revived stack serializes with a percent-decoded
    // URL, whose spelling misses the source map lookup. React then evals the
    // second revival's fake stack frame script without a source map, under
    // the chunk's own URL instead of an `about://React/` URL, and a debugger
    // cannot resolve its frames. The terminal resolves both revivals: the
    // fake script's URL spelling matches how Node.js keys the chunk's own
    // source map. ES module frames carry percent-encoded URLs instead of
    // paths, so `encodeURI` double-encodes them and `devirtualizeURL`'s
    // decode lands back on the loader's own spelling: every revival resolves.
    // TODO: the second CJS revival should resolve; the fake script URL
    // spelling must round-trip to the map lookup's key.
    describe('does not resolve the second CJS revival for chunk paths that percent-encoding changes', () => {
      it('brackets', () => {
        expect(renderBothModes('two-hops-bracket-chunk'))
          .toMatchInlineSnapshot(`
         "======== cjs ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:[root-of-the-server]__sim._.js
               at Object.throwsInChunk (about://React/Cache/file://<tmp>/%5Broot-of-the-server%5D__sim._.js?0:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:[root-of-the-server]__sim._.js
               at Object.throwsInChunk (<tmp>/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:[root-of-the-server]__sim._.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/%5Broot-of-the-server%5D__sim._.js?0:113:11
             original: file://<tmp>/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:[root-of-the-server]__sim._.js
               at Object.throwsInChunk (file://<tmp>/%5Broot-of-the-server%5D__sim._.js:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:[root-of-the-server]__sim._.js
               at Object.throwsInChunk (<tmp>/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:[root-of-the-server]__sim._.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/%5Broot-of-the-server%5D__sim._.js:113:11
             script: no source map
         == fake scripts ==
         file://<tmp>/[root-of-the-server]__sim._.js
           map: [root-of-the-server]__sim._.js.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/%5Broot-of-the-server%5D__sim._.js?0
           map: <map>
           | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         file://<tmp>/%5Broot-of-the-server%5D__sim._.js
           map: -
         ======== esm ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:[root-of-the-server]__sim._.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/%255Broot-of-the-server%255D__sim._.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:[root-of-the-server]__sim._.js
               at Module.throwsInChunk (<tmp>/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:[root-of-the-server]__sim._.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/%255Broot-of-the-server%255D__sim._.mjs?0:103:11
             original: file://<tmp>/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:[root-of-the-server]__sim._.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/%255Broot-of-the-server%255D__sim._.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:[root-of-the-server]__sim._.js
               at Module.throwsInChunk (<tmp>/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at two-hops-bracket-chunk (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:[root-of-the-server]__sim._.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/%255Broot-of-the-server%255D__sim._.mjs?0:103:11
             original: file://<tmp>/original.js:3
         == fake scripts ==
         file://<tmp>/%5Broot-of-the-server%5D__sim._.mjs
           map: [root-of-the-server]__sim._.mjs.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/%255Broot-of-the-server%255D__sim._.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/%255Broot-of-the-server%255D__sim._.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
        `)
      })

      it('space', () => {
        expect(renderBothModes('space-in-project-path')).toMatchInlineSnapshot(`
         "======== cjs ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Object.throwsInChunk (about://React/Cache/file://<tmp>/my%20project/chunk.js?0:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Object.throwsInChunk (<tmp>/my project/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/my%20project/chunk.js?0:113:11
             original: file://<tmp>/my%20project/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Object.throwsInChunk (file://<tmp>/my%20project/chunk.js:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Object.throwsInChunk (<tmp>/my project/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/my%20project/chunk.js:113:11
             script: no source map
         == fake scripts ==
         file://<tmp>/my%20project/chunk.js
           map: chunk.js.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/my%20project/chunk.js?0
           map: <map>
           | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         file://<tmp>/my%20project/chunk.js
           map: -
         ======== esm ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/my%2520project/chunk.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Module.throwsInChunk (<tmp>/my project/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/my%2520project/chunk.mjs?0:103:11
             original: file://<tmp>/my%20project/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/my%2520project/chunk.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Module.throwsInChunk (<tmp>/my project/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at space-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/my%2520project/chunk.mjs?0:103:11
             original: file://<tmp>/my%20project/original.js:3
         == fake scripts ==
         file://<tmp>/my%20project/chunk.mjs
           map: chunk.mjs.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/my%2520project/chunk.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/my%2520project/chunk.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
        `)
      })

      it('unicode', () => {
        expect(renderBothModes('unicode-in-project-path'))
          .toMatchInlineSnapshot(`
         "======== cjs ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Object.throwsInChunk (about://React/Cache/file://<tmp>/caf%C3%A9/chunk.js?0:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Object.throwsInChunk (<tmp>/café/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/caf%C3%A9/chunk.js?0:113:11
             original: file://<tmp>/caf%C3%A9/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Object.throwsInChunk (file://<tmp>/caf%C3%A9/chunk.js:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Object.throwsInChunk (<tmp>/café/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/caf%C3%A9/chunk.js:113:11
             script: no source map
         == fake scripts ==
         file://<tmp>/caf%C3%A9/chunk.js
           map: chunk.js.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/caf%C3%A9/chunk.js?0
           map: <map>
           | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         file://<tmp>/caf%C3%A9/chunk.js
           map: -
         ======== esm ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/caf%25C3%25A9/chunk.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Module.throwsInChunk (<tmp>/café/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/caf%25C3%25A9/chunk.mjs?0:103:11
             original: file://<tmp>/caf%C3%A9/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/caf%25C3%25A9/chunk.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Module.throwsInChunk (<tmp>/café/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at unicode-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/caf%25C3%25A9/chunk.mjs?0:103:11
             original: file://<tmp>/caf%C3%A9/original.js:3
         == fake scripts ==
         file://<tmp>/caf%C3%A9/chunk.mjs
           map: chunk.mjs.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/caf%25C3%25A9/chunk.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/caf%25C3%25A9/chunk.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
        `)
      })

      it('percent', () => {
        expect(renderBothModes('percent-in-project-path'))
          .toMatchInlineSnapshot(`
         "======== cjs ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Object.throwsInChunk (about://React/Cache/file://<tmp>/per%25cent/chunk.js?0:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Object.throwsInChunk (<tmp>/per%cent/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/per%25cent/chunk.js?0:113:11
             original: file://<tmp>/per%25cent/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Object.throwsInChunk (file://<tmp>/per%25cent/chunk.js:113:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Object.throwsInChunk (<tmp>/per%cent/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/per%25cent/chunk.js:113:11
             script: no source map
         == fake scripts ==
         file://<tmp>/per%25cent/chunk.js
           map: chunk.js.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/per%25cent/chunk.js?0
           map: <map>
           | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         file://<tmp>/per%25cent/chunk.js
           map: -
         ======== esm ========
         == hop 0 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/per%2525cent/chunk.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Module.throwsInChunk (<tmp>/per%cent/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/per%2525cent/chunk.mjs?0:103:11
             original: file://<tmp>/per%25cent/original.js:3
         == hop 1 (Cache) ==
         error.stack (the raw string):
           Error: boom:chunk.js
               at Module.throwsInChunk (about://React/Cache/file://<tmp>/per%2525cent/chunk.mjs?0:103:11)
               at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
               at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
               at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
               at process.processImmediate (node:internal/timers:<pos>)
               at process.callbackTrampoline (node:internal/async_hooks:<pos>)
         terminal (the dev server prints through the patched inspect):
           Error: boom:chunk.js
               at Module.throwsInChunk (<tmp>/per%cent/original.js:3:9)
               at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
               at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
               at percent-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
               at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
             1 | // original source
             2 | export function throwsInChunk() {
           > 3 |   throw new Error("boom:chunk.js")
               |<9 spaces>^
             4 | }
             5 | {
             environmentName: 'Cache',
             digest: '<hash>'
           }
         top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/per%2525cent/chunk.mjs?0:103:11
             original: file://<tmp>/per%25cent/original.js:3
         == fake scripts ==
         file://<tmp>/per%25cent/chunk.mjs
           map: chunk.mjs.map
         file://<tmp>/consumer-0/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/per%2525cent/chunk.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
         file://<tmp>/consumer-1/node_modules/flight-client/index.js
           map: -
         file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
           map: -
         about://React/Cache/file://<tmp>/per%2525cent/chunk.mjs?0
           map: <map>
           | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
           | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
        `)
      })
    })

    it('does not resolve the second revival for chunk paths with a hash', () => {
      // `encodeURI` leaves `#` intact, so the first revival's `sourceURL`
      // comment carries it raw and still resolves (Node.js keys the map under
      // the percent-encoded file URL). The second revival's fake script gets
      // the raw `file:` URL, and the source map lookup parses it as a URL
      // whose fragment starts at the `#`.
      // TODO: the second revival should resolve; `#` needs encoding before
      // the lookup parses the URL.
      expect(renderBothModes('hash-in-project-path')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/my#app/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/my#app/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/my#app/chunk.js?0:113:11
           original: file://<tmp>/my%23app/original.js:3
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (file://<tmp>/my#app/chunk.js:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/my:113:11)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at file://<tmp>/my#app/chunk.js:113:11
           script: no source map
       == fake scripts ==
       file://<tmp>/my%23app/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/my#app/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       file://<tmp>/my#app/chunk.js
         map: -
       ======== esm ========
       == hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Cache/file://<tmp>/my%2523app/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/my#app/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/my%2523app/chunk.mjs?0:103:11
           original: file://<tmp>/my%23app/original.js:3
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Cache/file://<tmp>/my%2523app/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/my#app/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at hash-in-project-path (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Cache/file://<tmp>/my%2523app/chunk.mjs?0:103:11
           original: file://<tmp>/my%23app/original.js:3
       == fake scripts ==
       file://<tmp>/my%23app/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/my%2523app/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/my%2523app/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves chunks required through a symlink', () => {
      // CJS resolution realpaths the module, so the frame already carries the
      // real path.
      expect(renderBothModes('symlinked-project-dir')).toMatchInlineSnapshot(`
       "======== cjs ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/real/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at symlinked-project-dir (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/real/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at symlinked-project-dir (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/real/chunk.js?0:113:11
           original: file://<tmp>/real/original.js:3
       == fake scripts ==
       file://<tmp>/real/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/real/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       ======== esm ========
       == hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Module.throwsInChunk (about://React/Server/file://<tmp>/real/chunk.mjs?0:103:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at symlinked-project-dir (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Module.throwsInChunk (<tmp>/real/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at symlinked-project-dir (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Module.throwsInChunk at about://React/Server/file://<tmp>/real/chunk.mjs?0:103:11
           original: file://<tmp>/real/original.js:3
       == fake scripts ==
       file://<tmp>/real/chunk.mjs
         map: chunk.mjs.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/real/chunk.mjs?0
         map: <map>
         | ({"Module.throwsInChunk":_=><102 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves every revival of webpack-internal frames', () => {
      // Node.js resolves the `webpack://` source as a URL, dropping `/./`.
      expect(renderScenario(runScenario('webpack-internal-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:webpack
             at Object.throwsInChunk (about://React/Server/webpack-internal:///(rsc)/./app/page.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at webpack-internal-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:webpack
             at Object.throwsInChunk (webpack://_N_E/app/page.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at webpack-internal-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/webpack-internal:///(rsc)/./app/page.js?0:101:34
           original: webpack://_N_E/app/page.js:3
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:webpack
             at Object.throwsInChunk (about://React/Server/webpack-internal:///(rsc)/./app/page.js?0:101:34)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at webpack-internal-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:webpack
             at Object.throwsInChunk (webpack://_N_E/app/page.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at webpack-internal-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom')
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/webpack-internal:///(rsc)/./app/page.js?0:101:34
           original: webpack://_N_E/app/page.js:3
       == fake scripts ==
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/webpack-internal:///(rsc)/./app/page.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/webpack-internal:///(rsc)/./app/page.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><100 newlines><33 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  // Errors carry the environment of their first serialization across every
  // later boundary; consumers root their responses in their own environment.
  describe('environments and layers', () => {
    itObservesTaskChains(
      'revives use cache errors across the RSC and SSR layers',
      () => {
        // The first revival happens in the use-cache consumer's 'Cache'-rooted
        // response, so the root task itself is `"use cache"` and the owner chain
        // sits directly on it. The second revival happens in the SSR layer's
        // 'Server'-rooted response, where the error's carried environment no
        // longer matches the root, so `getRootTask` nests a `"use cache"`
        // boundary task instead (and the re-serialization carried no owner).
        expect(renderScenario(runScenario('use-cache-layers')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  use-cache-layers (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  use-cache-layers (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           Object.renderPage at about://React/Cache/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         <Layout>
           Object.renderLayout at about://React/Cache/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use cache"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  use-cache-layers (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  use-cache-layers (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use cache"
           getRootTask at file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>
             script: no source map
         "use server"
           <no name> at file://<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Cache/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Cache/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
      }
    )

    itObservesTaskChains(
      'revives nested use cache errors across three layers',
      () => {
        // Two Cache-rooted consumers in a row: at both, the error's environment
        // matches the response root, so the owner chain (first hop) and the
        // plain root task (second hop) sit on `"use cache"` directly. Only the
        // SSR hop nests a boundary task.
        expect(renderScenario(runScenario('nested-cache-layers')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  nested-cache-layers (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  nested-cache-layers (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           Object.renderPage at about://React/Cache/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         <Layout>
           Object.renderLayout at about://React/Cache/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use cache"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == hop 1 (Cache) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  nested-cache-layers (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  nested-cache-layers (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use cache"
           <no name> at file://<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == hop 2 (Cache) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  nested-cache-layers (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-2/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  nested-cache-layers (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use cache"
           getRootTask at file://<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>
             script: no source map
         "use server"
           <no name> at file://<tmp>/consumer-2/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Cache/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Cache/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-2/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
      }
    )

    itObservesTaskChains(
      'wraps prefetch-stage errors in a "use prefetch" task',
      () => {
        expect(renderScenario(runScenario('prefetch-environment')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Prefetch) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Prefetch/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at prefetch-environment (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at prefetch-environment (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Prefetch',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Prefetch/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use prefetch"
           getRootTask at file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>
             script: no source map
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Prefetch/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
      }
    )

    itObservesTaskChains(
      'revives instant validation errors into the dev overlay payload',
      () => {
        const result = runScenario('instant-validation-stacks')
        // The per-segment re-encode forwards the digest verbatim; the value
        // crossing into the overlay's `{ errors }` payload drops it, and any
        // later serialization mints a fresh one — dedup identity does not
        // survive the value hop.
        // TODO: dedup identity should survive the value crossing into the
        // overlay payload.
        const [minted, forwarded, reminted] = result.digests
        expect(forwarded).toBe(minted)
        expect(reminted).not.toBe(minted)
        expect(renderScenario(result)).toMatchInlineSnapshot(`
       "== hop 0 (Prerender) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Prerender/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  instant-validation-stacks (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  instant-validation-stacks (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Prerender',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Prerender/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           Object.renderPage at about://React/Prerender/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         "use prerender"
           Object.renderLayout at about://React/Server/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == hop 1 (Prerender) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Prerender/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  instant-validation-stacks (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  instant-validation-stacks (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Prerender',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Prerender/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       == hop 2 (Prerender) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Prerender/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  instant-validation-stacks (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at resolveErrorDev (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             ... repeated 2 more times ...
             at parseModel (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at initializeModelChunk (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at getOutlinedModel (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at parseModelString (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at reviveModel (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Object.reviveRootModel (<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-2/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  instant-validation-stacks (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Prerender'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Prerender/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use prerender"
           getRootTask at file://<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js:<pos>
             script: no source map
         "use server"
           <no name> at file://<tmp>/consumer-2/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Prerender/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Prerender/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Prerender/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-2/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-2/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Prerender/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
      }
    )
  })

  describe('owner task chains', () => {
    // The async part of the revived error's stack, as an attached debugger
    // shows it: one task per owner, rooted in the response's task, each
    // task's top frame being the `createTask` call inside the owner's fake
    // stack frames. The chain continues into the dispatch context below the
    // root.
    itObservesTaskChains(
      'revives the owner chain as tasks over fake owner frames',
      () => {
        expect(renderScenario(runScenario('owner-stack')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-stack (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-stack (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           Object.renderPage at about://React/Server/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         <Layout>
           Object.renderLayout at about://React/Server/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Server/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})"
      `)
      }
    )

    itObservesTaskChains(
      'labels owners from another environment with the environment',
      () => {
        // The owner's fake frames eval under the parent's environment name.
        expect(renderScenario(runScenario('owner-stack-cross-environment')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-stack-cross-environment (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-stack-cross-environment (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use cache"
           Object.renderPage at about://React/Server/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         <Layout>
           Object.renderLayout at about://React/Server/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Server/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})"
      `)
      }
    )

    itObservesTaskChains(
      'wraps ownerless prerender-stage errors in a "use prerender" task',
      () => {
        // `getRootTask` creates the boundary task with no fake frames around
        // it, so its top frame is `getRootTask` itself, not user source.
        // TODO: the boundary task's top frame should not be the revival
        // machinery.
        expect(renderScenario(runScenario('prerender-environment')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Prerender) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Prerender/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at prerender-environment (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at prerender-environment (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Prerender',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Prerender/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use prerender"
           getRootTask at file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>
             script: no source map
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Prerender/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
      }
    )

    itObservesTaskChains(
      'replaces the boundary owner name with the prerender label',
      () => {
        // The boundary task keeps the owner's callsite frames even though its
        // name is the environment label.
        expect(renderScenario(runScenario('prerender-owner-stack')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Prerender) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Prerender/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  prerender-owner-stack (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  prerender-owner-stack (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Prerender',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Prerender/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           Object.renderPage at about://React/Prerender/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         "use prerender"
           Object.renderLayout at about://React/Server/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Prerender/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Prerender/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})"
      `)
      }
    )

    itObservesTaskChains('attaches each serialization its own owner', () => {
      // Owners are not carried across hops: the first serialization here has
      // none, the second attaches the serializing task's owner chain.
      expect(renderScenario(runScenario('owner-at-second-hop')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-at-second-hop (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-at-second-hop (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-at-second-hop (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-at-second-hop (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           Object.renderPage at about://React/Server/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         <Layout>
           Object.renderLayout at about://React/Server/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use server"
           <no name> at file://<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Server/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})"
      `)
    })

    itObservesTaskChains(
      'labels a server owner under a cache root with "use server"',
      () => {
        expect(renderScenario(runScenario('owner-stack-inverse-environment')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Cache) ==
       error.stack (the raw string):
         Error: boom:owner
             at Object.throwsInChunk (about://React/Cache/file://<tmp>/chunk.js?0:124:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-stack-inverse-environment (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at writeOwnerFixture (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  owner-stack-inverse-environment (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner')
             |<9 spaces>^
           4 | }
           5 | function jsx() {
           6 |   return new Error('react-stack-top-frame') {
           environmentName: 'Cache',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Cache/file://<tmp>/chunk.js?0:124:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           Object.renderPage at about://React/Server/file://<tmp>/chunk.js?2:130:12
             original: file://<tmp>/original.js:9
         "use server"
           Object.renderLayout at about://React/Cache/file://<tmp>/chunk.js?1:133:12
             original: file://<tmp>/original.js:12
         "use cache"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Cache/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><123 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Cache/file://<tmp>/chunk.js?1
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<130 newlines>({"Object.renderLayout":
         | _=>
         | <11 spaces>_()})
       about://React/Server/file://<tmp>/chunk.js?2
         map: <map>
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */<127 newlines>({"Object.renderPage":
         | _=>
         | <11 spaces>_()})"
      `)
      }
    )

    itObservesTaskChains(
      'falls back to the root task for owners without a stack',
      () => {
        expect(renderScenario(runScenario('owner-without-stack')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at owner-without-stack (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at owner-without-stack (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       owner tasks:
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
      }
    )

    itObservesTaskChains(
      'creates the owner task without frames when its stack filters away',
      () => {
        // An empty (fully filtered) owner stack still creates the component
        // task, but with no fake frames around the `createTask` call, so its
        // top frame is the revival machinery.
        // TODO: the owner task's top frame should not be the revival
        // machinery.
        expect(renderScenario(runScenario('owner-with-filtered-stack')))
          .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at owner-with-filtered-stack (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at owner-with-filtered-stack (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       owner tasks:
         <Page>
           initializeFakeTask at file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>
             script: no source map
         "use server"
           <no name> at file://<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>
             script: no source map
         Immediate
           init at node:internal/inspector_async_hook:<pos>
             script: no source map
         await
           main at file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             script: no source map
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/node_modules/owner-lib/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
      }
    )

    it('revives owner-stack rewritten errors with owner callsite frames', () => {
      // `applyOwnerStack` kept the error's own frames up to React's bottom
      // frame and appended the owner stack, so the frames below the throw are
      // the owner callsites, revived as fake frames like any other.
      expect(renderScenario(runScenario('owner-stack-rewrite')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:owner-rewrite
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:121:11)
             at Page (about://React/Server/file://<tmp>/chunk.js?1:124:12)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:owner-rewrite
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at Page (<tmp>/original.js:6:10)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:owner-rewrite')
             |<9 spaces>^
           4 | }
           5 | export function Page() {
           6 |   return throwsInChunk() {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:121:11
           original: file://<tmp>/original.js:3
       caller frame: Page at about://React/Server/file://<tmp>/chunk.js?1:124:12
           original: file://<tmp>/original.js:6
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><120 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<tmp>/chunk.js?1
         map: <map>
         | ({"Page":_=><123 newlines><11 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  // `patchErrorInspectNodeJS` formats every printed error: source-mapped
  // frames, code frames, ignore-list collapsing, and the react bottom frame
  // cut.
  describe('terminal output', () => {
    it('cuts terminal output at the react bottom frame', () => {
      // Errors that never cross a Flight boundary still print through the
      // patched inspect, which cuts everything below React's bottom frame.
      expect(renderScenario(runScenario('unserialized-error-terminal')))
        .toMatchInlineSnapshot(`
       "== hop 0 (unserialized) ==
       error.stack (the raw string):
         Error: boom:unserialized
             at throwsInChunk (<tmp>/chunk.js:121:11)
             at Object.react_stack_bottom_frame (<tmp>/chunk.js:124:12)
             at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             at throwAndCatch (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at unserialized-error-terminal (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:unserialized
             at throwsInChunk (<tmp>/original.js:3:9)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error('boom:unserialized')
             |<9 spaces>^
           4 | }
           5 | export function react_stack_bottom_frame() {
           6 |   return throwsInChunk()
       top frame (as an attached debugger resolves it): throwsInChunk at <tmp>/chunk.js:121:11
           script: not loaded
       == hop 1 (unserialized) ==
       error.stack (the raw string):
         Error: boom:plain.js
             at throwsInChunk (<tmp>/plain.js:113:11)
             at Array.map (<anonymous>)
             at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             at throwAndCatch (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at unserialized-error-terminal (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:plain.js
             at throwsInChunk (<tmp>/original.js:3:9)
             at Array.map (<anonymous>)
             at <unknown> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at unserialized-error-terminal (test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:plain.js")
             |<9 spaces>^
           4 | }
           5 |
       top frame (as an attached debugger resolves it): throwsInChunk at <tmp>/plain.js:113:11
           script: not loaded
       == hop 2 (unserialized) ==
       error.stack (the raw string):
         Error: boom:react-stack-bottom-frame.js
             at Object.throwsInChunk (<tmp>/marker/react-stack-bottom-frame.js:113:11)
             at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             at throwAndCatch (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at unserialized-error-terminal (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:react-stack-bottom-frame.js
             at Object.throwsInChunk (<tmp>/marker/original.js:3:9)
             at <unknown> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at unserialized-error-terminal (test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:react-stack-bottom-frame.js")
             |<9 spaces>^
           4 | }
           5 |
       top frame (as an attached debugger resolves it): Object.throwsInChunk at <tmp>/marker/react-stack-bottom-frame.js:113:11
           script: not loaded
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/plain.js
         map: plain.js.map
       file://<tmp>/marker/react-stack-bottom-frame.js
         map: react-stack-bottom-frame.js.map"
      `)
    })

    it('ignore-lists native frames sandwiched between ignored frames', () => {
      expect(renderScenario(runScenario('sandwiched-native-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (unserialized) ==
       error.stack (the raw string):
         Error: boom:sandwich
             at inner (<tmp>/node_modules/lib/index.js:3:11)
             at Array.map (<anonymous>)
             at outer (<tmp>/node_modules/lib/index.js:2:14)
             at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             at throwAndCatch (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at sandwiched-native-frames (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:sandwich
             at <unknown> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at sandwiched-native-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at main (test/unit/fake-stack-frames/scenario.js:<pos>)
       top frame (as an attached debugger resolves it): inner at <tmp>/node_modules/lib/index.js:3:11
           script: not loaded
       == fake scripts ==
       file://<tmp>/node_modules/lib/index.js
         map: -"
      `)
    })

    it('caches terminal source map lookups per file within one error', () => {
      // The second frame from each file reuses the cached consumer (good
      // chunk, both frames resolve) or the cached failure (bad bundler map,
      // the invalid-map warning prints once, both frames stay generated).
      expect(renderScenario(runScenario('terminal-cache-paths')))
        .toMatchInlineSnapshot(`
       "== hop 0 (unserialized) ==
       error.stack (the raw string):
         Error: boom:cached-consumer
             at throwsInChunk (<tmp>/good.js:121:11)
             at Object.callsThrough (<tmp>/good.js:124:12)
             at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             at throwAndCatch (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at terminal-cache-paths (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:cached-consumer
             at throwsInChunk (<tmp>/original.js:3:9)
             at Object.callsThrough (<tmp>/original.js:6:10)
             at <unknown> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at terminal-cache-paths (test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:cached-consumer")
             |<9 spaces>^
           4 | }
           5 | export function callsThrough() {
           6 |   return throwsInChunk()
       top frame (as an attached debugger resolves it): throwsInChunk at <tmp>/good.js:121:11
           script: not loaded
       == hop 1 (unserialized) ==
       error.stack (the raw string):
         Error: boom:cached-failure
             at throwsInChunk (<tmp>/bad/bad.js:121:11)
             at Object.callsThrough (<tmp>/bad/bad.js:124:12)
             at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
             at throwAndCatch (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at terminal-cache-paths (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:cached-failure
             at throwsInChunk (<tmp>/bad/bad.js:121:11)
             at Object.callsThrough (<tmp>/bad/bad.js:124:12)
             at <unknown> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at terminal-cache-paths (test/unit/fake-stack-frames/scenario.js:<pos>)
             at async main (test/unit/fake-stack-frames/scenario.js:<pos>)
       top frame (as an attached debugger resolves it): throwsInChunk at <tmp>/bad/bad.js:121:11
           script: not loaded
       == fake scripts ==
       file://<tmp>/good.js
         map: good.js.map
       file://<tmp>/bad/bad.js
         map: -"
      `)
    })

    it('keeps ignore-listed frames in terminal output when asked to', () => {
      expect(
        renderScenario(
          runScenario('thrown-string', { __NEXT_SHOW_IGNORE_LISTED: 'true' })
        )
      ).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:string
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:string
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.resolveErrorDev at <tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>
           script: not loaded
       == fake scripts ==
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -"
      `)
    })

    it('prints terminal output without code frames when none is installed', () => {
      // `next start` never installs the code frame renderer.
      expect(
        renderScenario(
          runScenario('one-hop', { SCENARIO_SKIP_CODE_FRAMES: 'true' })
        )
      ).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at one-hop (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at one-hop (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('rewrites webpack export helper names in terminal frames', () => {
      expect(renderScenario(runScenario('webpack-export-frame-names')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:export
             at Object.__WEBPACK_DEFAULT_EXPORT__ (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at webpack-export-frame-names (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:export
             at Object.default (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at webpack-export-frame-names (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | function __WEBPACK_DEFAULT_EXPORT__() {
         > 3 |   throw new Error('boom:export')
             |<9 spaces>^
           4 | }
           5 | export { __WEBPACK_DEFAULT_EXPORT__ as throwsInChunk }
           6 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.__WEBPACK_DEFAULT_EXPORT__ at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.__WEBPACK_DEFAULT_EXPORT__":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  // The redbox: the overlay client posts parsed frames to
  // `/__nextjs_original-stack-frames`, resolved server-side by
  // `getOriginalStackFrames` with the endpoint's code frame options. Only
  // the browser-side fetch wrapper and rendering are not modeled.
  describe('digests', () => {
    it('suffixes digests with the error code and forwards them', () => {
      expect(renderScenario(runScenario('error-code-digest')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-code-digest (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-code-digest (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>@E118'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == hop 1 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-code-digest (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-1/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at error-code-digest (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>@E118'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       file://<tmp>/consumer-1/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-1/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('collides digests of identical throws onto the first error', () => {
      // TODO: distinct error objects with identical stacks should not
      // collapse onto the first thrown error during digest recovery.
      const result = runScenario('digest-collision')
      expect(result.htmlHandler).toEqual({
        digestsCollide: true,
        mapKeepsFirstError: true,
      })
      expect(renderScenario(result)).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at digest-collision (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at digest-collision (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })
  })

  describe('the dev overlay', () => {
    it('resolves revived frames through the dev overlay machinery', () => {
      expect(renderScenario(runScenario('dev-overlay-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at dev-overlay-frames (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (file://<repo>/test/unit/fake-stack-frames/scenario.js:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (<tmp>/original.js:3:9)
             at <anonymous> (test/unit/fake-stack-frames/scenario.js:<pos>)
             at throwAndCatch (test/unit/fake-stack-frames/scenario.js:<pos>)
             at dev-overlay-frames (test/unit/fake-stack-frames/scenario.js:<pos>)
             at  main (test/unit/fake-stack-frames/scenario.js:<pos>)
           1 | // original source
           2 | export function throwsInChunk() {
         > 3 |   throw new Error("boom:chunk.js")
             |<9 spaces>^
           4 | }
           5 | {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       overlay frames:
         Object.throwsInChunk at original.js:3:9
           |   1 | // original source
           |   2 | export function throwsInChunk() {
           | > 3 |   throw new Error("boom:chunk.js")
           |     |<9 spaces>^
           |   4 | }
           |   5 |
         <anonymous> at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
         throwAndCatch at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
         dev-overlay-frames at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
          main at <repo>/test/unit/fake-stack-frames/scenario.js:<pos>
         Object.resolveErrorDev at <tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos> (ignored)
         Immediate.<anonymous> at <tmp>/consumer-0/node_modules/flight-client/index.js:<pos> (ignored)
         process.processImmediate at node:internal/timers:<pos> (ignored)
         process.callbackTrampoline at node:internal/async_hooks:<pos> (ignored)
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: <map>
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('resolves fake frame maps through the endpoint like a browser', () => {
      // The real browser `findSourceMapURL` mints `/__nextjs_source-map`
      // URLs for the fake scripts, and a debugger fetches them through the
      // dev server.
      expect(
        renderScenario(
          runScenario('browser-flight-source-maps', {}, 'cjs', {
            // The browser client mints endpoint URLs for every filename;
            // the dev server has no map for the harness's own files, so
            // the debugger's fetch for those comes back empty.
            // TODO: only mint fake script map URLs the server can answer.
            unmappedFakeScripts: ['/fake-stack-frames/scenario.js'],
            // A harness artifact, not a real crossing: the harness prints
            // every revived error through the patched Node inspect, which
            // cannot fetch `http:` map URLs. A browser-revived error only
            // reaches the real terminal as forwarded log text, which
            // devirtualizes fake frames (covered below).
            rawTerminalURLs: ['hop 0'],
          })
        )
      ).toMatchInlineSnapshot(`
       "== hop 0 (Server) ==
       error.stack (the raw string):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?1:<pos>)
             at throwAndCatch (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?2:<pos>)
             at browser-flight-source-maps (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?3:<pos>)
             at  main (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?4:<pos>)
             at Object.resolveErrorDev (<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js:<pos>)
             at Immediate.<anonymous> (<tmp>/consumer-0/node_modules/flight-client/index.js:<pos>)
             at process.processImmediate (node:internal/timers:<pos>)
             at process.callbackTrampoline (node:internal/async_hooks:<pos>)
       terminal (the dev server prints through the patched inspect):
         Error: boom:chunk.js
             at Object.throwsInChunk (about://React/Server/file://<tmp>/chunk.js?0:113:11)
             at <anonymous> (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?1:<pos>)
             at throwAndCatch (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?2:<pos>)
             at browser-flight-source-maps (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?3:<pos>)
             at  main (about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?4:<pos>) {
           environmentName: 'Server',
           digest: '<hash>'
         }
       top frame (as an attached debugger resolves it): Object.throwsInChunk at about://React/Server/file://<tmp>/chunk.js?0:113:11
           original: file://<tmp>/original.js:3
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/consumer-0/node_modules/flight-client/index.js
         map: -
       file://<tmp>/consumer-0/node_modules/flight-client/react-flight-semantics.js
         map: -
       about://React/Server/file://<tmp>/chunk.js?0
         map: http://localhost:3000/__nextjs_source-map?filename=<tmp>%2Fchunk.js
         | ({"Object.throwsInChunk":_=><112 newlines><10 spaces>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?1
         map: http://localhost:3000/__nextjs_source-map?filename=<repo>%2Ftest%2Funit%2Ffake-stack-frames%2Fscenario.js
         | ({"<anonymous>":_=><padding>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?2
         map: http://localhost:3000/__nextjs_source-map?filename=<repo>%2Ftest%2Funit%2Ffake-stack-frames%2Fscenario.js
         | ({"throwAndCatch":_=><padding>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?3
         map: http://localhost:3000/__nextjs_source-map?filename=<repo>%2Ftest%2Funit%2Ffake-stack-frames%2Fscenario.js
         | ({"browser-flight-source-maps":_=><padding>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */
       about://React/Server/file://<repo>/test/unit/fake-stack-frames/scenario.js?4
         map: http://localhost:3000/__nextjs_source-map?filename=<repo>%2Ftest%2Funit%2Ffake-stack-frames%2Fscenario.js
         | ({" main":_=><padding>_()})
         | /* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
      `)
    })

    it('maps browser console log frames for the terminal', () => {
      // Extension frames are dropped, unmapped chunks stay generated,
      // fake frames of revived errors logged in the browser devirtualize
      // to their server path, and `withLocation` appends the mapped
      // top-frame location to the args.
      expect(renderScenario(runScenario('browser-log-source-mapping')))
        .toMatchInlineSnapshot(`
       "== hop 0 (browser) ==
       error.stack (the raw string):
         Error: client log
             at throwsInChunk (http://localhost:3000/_next/static/chunks/app.js:113:11)
             at injected (chrome-extension://abcdef/content.js:1:1)
             at unknown (http://localhost:3000/_next/static/chunks/other.js:1:1)
             at Page (about://React/Server/file://<tmp>/server-page.js?0:113:11)
       terminal (the dev server prints through the patched inspect):
         (not printed)
       top frame (as an attached debugger resolves it): no frame
       == browser log mapping ==
         kind: with-frame-code
         at throwsInChunk (static/chunks/original.js:3:9) [code frame]
         at unknown (static/chunks/other.js:1:1)
         at Page (server-page.js:113:11)
         console location: static/chunks/original.js:3:9
         decorated: ["hello from the browser","(static/chunks/original.js:3:9)"]
       == fake scripts ==
       file://<tmp>/static/chunks/app.js
         map: app.js.map"
      `)
    })

    it('serves source maps to the browser through the endpoint', () => {
      // The decoded `file://` spelling with a raw space misses both the
      // native lookup and the decode fallback — the endpoint-side twin of
      // the percent-encoding defects.
      // TODO: the endpoint should resolve decoded `file://` spellings like
      // the encoded ones.
      expect(renderScenario(runScenario('source-map-endpoint')))
        .toMatchInlineSnapshot(`
       "== hop 0 (browser) ==
       error.stack (the raw string):
         (not observed)
       terminal (the dev server prints through the patched inspect):
         (not printed)
       top frame (as an attached debugger resolves it): no frame
       == /__nextjs_source-map ==
         chunk path: 200 with map
         chunk file URL: 200 with map
         path with a space: 200 with map
         encoded file URL with a space: 200 with map
         decoded file URL with a space: 204
         unknown file: 204
       == fake scripts ==
       file://<tmp>/chunk.js
         map: chunk.js.map
       file://<tmp>/my%20project/chunk.js
         map: chunk.js.map"
      `)
    })

    it('cleans up browser-reported frames for the overlay', () => {
      expect(renderScenario(runScenario('overlay-browser-frames')))
        .toMatchInlineSnapshot(`
       "== hop 0 (browser) ==
       error.stack (the raw string):
         Error: boom
             at evil (eval at run (<tmp>/host.js:1:1), <anonymous>:5:9)
             at page (http://localhost:3000/_next/static/chunks/app/page.js:10:5)
       terminal (the dev server prints through the patched inspect):
         (not printed)
       top frame (as an attached debugger resolves it): no frame
       overlay frames:
         evil at host.js:1:1
         page at static/chunks/app/page.js:10:5
       == fake scripts =="
      `)
    })
  })
})
