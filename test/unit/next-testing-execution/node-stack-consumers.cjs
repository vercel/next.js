const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Module = require('node:module')
const { createRequire } = Module
const { pathToFileURL } = require('node:url')

function run(packageRoot, mode, overlay) {
  assert.equal(process.sourceMapsEnabled, true)
  const load = createRequire(path.join(packageRoot, 'package.json'))
  const source = path.join(__dirname, 'fixtures/node-stack-trace')
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'next-node-stack-consumers-'))
  )
  const resolver = Module._resolveFilename
  const nativeExtension = Module._extensions['.node']
  let nativeAddonsLoaded = 0
  Module._extensions['.node'] = () => {
    nativeAddonsLoaded++
    throw new Error('No native addon belongs to this stack consumer control')
  }
  if (overlay) {
    Module._resolveFilename = function (request, parent, ...rest) {
      if (parent?.filename.startsWith(overlay + path.sep)) {
        if (request.startsWith('.')) {
          const relative = path.relative(
            overlay,
            path.resolve(path.dirname(parent.filename), request)
          )
          const selected = path.join(
            overlay,
            relative.endsWith('.js') ? relative : relative + '.js'
          )
          if (fs.existsSync(selected)) return selected
          return resolver.call(
            this,
            path.join(packageRoot, 'dist', relative),
            parent,
            ...rest
          )
        }
        if (request.startsWith('next/')) return load.resolve(request)
      }
      return resolver.call(this, request, parent, ...rest)
    }
  }
  const product = (suffix) =>
    overlay
      ? require(path.join(overlay, 'experimental/testing', suffix))
      : load('next/dist/experimental/testing/' + suffix)
  try {
    for (const [input, output] of [
      ['thrower.ts.txt', 'thrower.ts'],
      ['thrower.js.txt', 'thrower.js'],
      ['thrower.js.map.json', 'thrower.js.map'],
    ])
      fs.copyFileSync(path.join(source, input), path.join(directory, output))
    const { restoreNodeStackTrace } = product('execution/node-stack-trace.js')
    load('next/dist/server/node-environment-baseline')
    const inspect = load('next/dist/server/patch-error-inspect')
    inspect.patchErrorInspectNodeJS(Error)
    const { createArtifactSourceMapLookup } = product(
      'execution/source-maps.js'
    )
    const file = path.join(directory, 'thrower.ts')
    const content = fs.readFileSync(file, 'utf8')
    const artifact = {
      kind: 'node',
      profile: { environment: 'node' },
      rootDir: directory,
      files: ['thrower.js', 'thrower.js.map'],
      sourceHash: crypto.createHash('sha256').update(content).digest('hex'),
    }
    const generatedOnly = createArtifactSourceMapLookup(artifact)
    assert.equal(Object.hasOwn(generatedOnly, 'originalSource'), false)
    assert.ok(generatedOnly(path.join(directory, 'thrower.js')))
    const lookup = createArtifactSourceMapLookup(artifact, file)
    inspect.setBundlerFindSourceMapImplementation(lookup)
    restoreNodeStackTrace()
    const compiled = require(path.join(directory, 'thrower.js'))
    const { original: error } = compiled.capture()
    const raw = error.stack
    assert.match(raw, /thrower\.ts:4:\d+/)
    const stackFrames = product('reporting/test-stack-frames.js')
    const entry = stackFrames
      .getTestStackFrames(raw, { includeSourceContent: true })
      .find((value) => value.kind === 'authored')
    assert.ok(entry)
    assert.equal(entry.source.file, file)
    assert.equal(entry.source.content, content)
    assert.equal(
      Object.hasOwn(entry.frame, 'original'),
      false,
      'native-authored frames must not manufacture generated-map flags'
    )
    const actualLocation = {
      file,
      line: entry.frame.line1,
      column: entry.frame.column1,
    }
    if (mode === 'locations') {
      const { mapTestDeclarationLocation } = product(
        'reporting/declaration-location.js'
      )
      const { mapTestAnnotationLocation } = product(
        'reporting/source-mapped-diagnostics.js'
      )
      const { mapTestArtifactLocation } = product(
        'reporting/artifact-location.js'
      )
      assert.deepEqual(mapTestDeclarationLocation(error, file), {
        line: actualLocation.line,
        column: actualLocation.column,
      })
      assert.deepEqual(mapTestAnnotationLocation(error, file), actualLocation)
      assert.deepEqual(mapTestArtifactLocation(error, file), actualLocation)
      assert.equal(
        mapTestDeclarationLocation(error, path.join(directory, 'foreign.ts')),
        undefined
      )
    } else if (mode === 'snapshots') {
      const { mapSnapshotLocation } = product(
        'reporting/source-mapped-diagnostics.js'
      )
      assert.deepEqual(
        mapSnapshotLocation({
          method: 'capture',
          file: pathToFileURL(file).href,
          line: actualLocation.line,
          column: actualLocation.column,
        }),
        { method: 'capture', ...actualLocation }
      )
      assert.throws(
        () =>
          mapSnapshotLocation({
            method: 'capture',
            file,
            line: 999,
            column: 1,
          }),
        /original source location/
      )
      assert.throws(
        () =>
          mapSnapshotLocation({
            method: 'capture',
            file: path.join(directory, 'foreign.ts'),
            line: 4,
            column: 1,
          }),
        /original source location/
      )
    } else if (mode === 'diagnostics') {
      const { serializeSourceMappedDiagnostic } = product(
        'reporting/source-mapped-diagnostics.js'
      )
      const diagnostic = serializeSourceMappedDiagnostic(error, {
        phase: 'runtime',
      })
      const selected = diagnostic.frames.find(
        (frame) =>
          frame.file === pathToFileURL(file).href || frame.file === file
      )
      assert.ok(selected)
      assert.equal(selected.line, actualLocation.line)
      assert.equal(selected.column, actualLocation.column)
      assert.match(selected.codeFrame, /new ObservedError/)
      const separators = compiled.separators()
      const separatorStack = separators.stack
      const separatorDiagnostic = serializeSourceMappedDiagnostic(separators, {
        phase: 'runtime',
      })
      const separatorFrame = separatorDiagnostic.frames.find(
        (frame) =>
          frame.file === pathToFileURL(file).href || frame.file === file
      )
      assert.ok(separatorFrame)
      assert.match(separatorFrame.codeFrame, /new Error\('actual separators '/)
      assert.equal(separators.stack, separatorStack)
    } else if (mode === 'suite-own') {
      const { createCollector } = load(
        'next/dist/experimental/testing/runner/collector'
      )
      const { captureReporterTaskTree } = load(
        'next/dist/experimental/testing/reporting/live-tasks'
      )
      const { createCapturedStackMapper, createSuiteErrorResultProjection } =
        product('execution/suite-error-projection.js')
      const { createArtifactRegistrationOriginMapper } = product(
        'execution/registration-origin.js'
      )
      const collector = createCollector('owner', { filePath: file })
      const { getCollectionTaskView } = load(
        'next/dist/experimental/testing/runner/tasks'
      )
      const owner = getCollectionTaskView(collector.root, collector.root, {
        filePath: file,
        testTimeout: 5000,
      })
      owner.result = { state: 'fail', errors: [error] }
      const map = createCapturedStackMapper(
        createArtifactRegistrationOriginMapper(artifact, file)
      )
      const project = createSuiteErrorResultProjection(owner, map)
      const captured = captureReporterTaskTree(
        owner,
        new Map([
          [
            owner.id,
            { result: owner.result, meta: owner.meta, projectResult: project },
          ],
        ])
      )
      assert.equal(captured.result.errors[0].stack, raw)
      const frame = captured.result.errors[0].stacks.find(
        (frame) => frame.file === file
      )
      assert.ok(frame)
      assert.equal(frame.line, actualLocation.line)
      assert.equal(frame.column, actualLocation.column)
      let reads = 0
      const replacement = { name: 'Error', message: 'captured replacement' }
      Object.defineProperty(replacement, 'stack', {
        enumerable: true,
        get() {
          reads++
          return raw
        },
      })
      owner.result = { state: 'fail', errors: [replacement] }
      const replaced = captureReporterTaskTree(
        owner,
        new Map([
          [
            owner.id,
            { result: owner.result, meta: owner.meta, projectResult: project },
          ],
        ])
      )
      assert.equal(
        reads,
        1,
        'post-clone projection must not reread the original stack getter'
      )
      assert.equal(replaced.result.errors[0].stack, raw)
      assert.ok(
        replaced.result.errors[0].stacks.some((frame) => frame.file === file)
      )
      const foreignCollector = createCollector('foreign', { filePath: file })
      const foreign = getCollectionTaskView(
        foreignCollector.root,
        foreignCollector.root,
        { filePath: file, testTimeout: 5000 }
      )
      const unchanged = { errors: [{ stack: raw }] }
      project(foreign, unchanged)
      assert.equal(unchanged.errors[0].stacks, undefined)
      const truthy = { errors: [{ stack: raw, stacks: [] }] }
      const originalStacks = truthy.errors[0].stacks
      project(owner, truthy)
      assert.equal(truthy.errors[0].stacks, originalStacks)
    } else if (mode === 'refusals') {
      assert.equal(
        stackFrames
          .getTestStackFrames(
            'Error\n    at foreign (' +
              path.join(directory, 'foreign.ts') +
              ':4:1)'
          )
          .some((entry) => entry.kind === 'authored'),
        false
      )
      assert.equal(
        stackFrames
          .getTestStackFrames('Error\n    at foreign (' + file + ':999:1)')
          .some((entry) => entry.kind === 'authored'),
        false
      )
      assert.equal(
        stackFrames
          .getTestStackFrames('Error\n    at foreign (' + file + ':4:9999)')
          .some((entry) => entry.kind === 'authored'),
        false
      )
      const mismatch = createArtifactSourceMapLookup(
        { ...artifact, sourceHash: '0'.repeat(64) },
        file
      )
      inspect.setBundlerFindSourceMapImplementation(mismatch)
      assert.equal(
        stackFrames
          .getTestStackFrames(raw)
          .some((entry) => entry.kind === 'authored'),
        false
      )
      const ignoredMap = JSON.parse(
        fs.readFileSync(path.join(directory, 'thrower.js.map'), 'utf8')
      )
      ignoredMap.ignoreList = [0]
      fs.writeFileSync(
        path.join(directory, 'thrower.js.map'),
        JSON.stringify(ignoredMap)
      )
      inspect.setBundlerFindSourceMapImplementation(
        createArtifactSourceMapLookup(artifact, file)
      )
      const ignored = stackFrames
        .getTestStackFrames(raw, { includeSourceContent: true })
        .find((entry) => entry.kind === 'authored')
      assert.ok(ignored)
      assert.equal(stackFrames.isTestFrameIgnored(ignored), true)
      assert.equal(
        stackFrames.getTestFrameSource(ignored),
        null,
        'ignored dependency content cannot capture the user excerpt slot'
      )
    } else if (mode === 'registration') {
      const { createArtifactRegistrationOriginMapper } = product(
        'execution/registration-origin.js'
      )
      const origin = createArtifactRegistrationOriginMapper(artifact, file)
      // This actual frame is a NewExpression, not an identifier declaration
      // call; original-source membership must not invent callee association.
      assert.equal(origin(error), undefined)
      assert.equal(origin(raw), undefined)
      const declaration = compiled.declaration()
      const declarationStack = declaration.stack
      const actual = stackFrames
        .getTestStackFrames(declarationStack)
        .find((entry) => entry.kind === 'authored')
      assert.ok(actual)
      const expected = {
        location: {
          file,
          line: actual.frame.line1,
          column: actual.frame.column1,
        },
        source: content,
      }
      assert.deepEqual(origin(declaration), expected)
      assert.deepEqual(origin(declarationStack), expected)
      assert.equal(declaration.stack, declarationStack)
    } else throw new Error('Unknown control: ' + mode)
    assert.equal(error.stack, raw)
    assert.equal(nativeAddonsLoaded, 0)
    return {
      mode,
      actualRetainedCompilerSource: true,
      nativeAuthoredVariant: true,
      rawStackUnchanged: true,
      nativeAddonsLoaded,
    }
  } finally {
    Module._resolveFilename = resolver
    Module._extensions['.node'] = nativeExtension
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
module.exports = { run }
if (require.main === module) {
  try {
    console.log(
      JSON.stringify(
        run(path.resolve(process.argv[2]), process.argv[3], process.argv[4])
      )
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
