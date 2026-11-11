const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { readFileSync, mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { runInThisContext } = require('node:vm')
const [mode, runnerPath] = process.argv.slice(2)
assert.ok(['node', 'browser'].includes(mode))
const local = createRequire(runnerPath)
const client = mode === 'browser' && local('../client/async-context')
const platform = local(
  mode === 'browser' ? '../client/invocation-platform' : './invocation-platform'
)
const frames = new Map()
if (mode === 'browser') {
  const filename = local.resolve('./invocation-platform')
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: {
      ...platform,
      invokeTestCallback(fn, context, owner) {
        const selected = frames.get(owner.id)
        assert.ok(selected, 'The real Browser attempt frame must already exist')
        const leave = client.enterCreatorScope(selected.token)
        try {
          return platform.invokeTestCallback(fn, context, owner)
        } finally {
          leave()
        }
      },
    },
  }
}
// This child runs the actual shared initializeTestFile/runCollected dispatcher,
// assertions and listener stacks. Browser mode selects the actual callback platform
// and explicit real client attempt frames; its framework host retains Node ALS.
// It does not stand in for native lowering or Browser assertion/counter proofs.
const runner = local(runnerPath)
const common = local('../vitest')
const pristine = require('./browser-context-identity-pristine.json')
const originalLog = console.log
const directory = mkdtempSync(join(tmpdir(), 'next-browser-context-identity-'))
const groups = []
let frame, file, published
async function main() {
  try {
    for (const group of ['positive', 'identity-pass', 'identity-fail']) {
      const rows = []
      console.log = (...args) => {
        if (
          typeof args[0] === 'string' &&
          args[0].startsWith('BROWSER_HOOK_CONTEXT_RAW ')
        )
          rows.push(
            JSON.parse(args[0].slice('BROWSER_HOOK_CONTEXT_RAW '.length))
          )
        else Reflect.apply(originalLog, console, args)
      }
      file = runner.initializeTestFile({
        fileId: 'identity-' + group,
        filePath: join(directory, group + '.mjs'),
        resourceLifetime: 'file',
      })
      const source = readFileSync(
        join(__dirname, 'browser-context-' + group + '.mjs.txt'),
        'utf8'
      )
      const [imports, ...body] = source.split('\n')
      assert.ok(imports.startsWith('import { '))
      const names = imports
        .slice('import { '.length, imports.indexOf(' }'))
        .split(', ')
      await file.collect(async () => {
        runInThisContext(
          `(function(${names.join(',')}) {\n${body.join('\n')}\n})`,
          { filename: group + '.mjs' }
        )(...names.map((name) => common[name]))
      })
      const late = []
      const result = await file.run({
        runId: 'identity-' + group,
        signal: new AbortController().signal,
        onLateFailure(error) {
          late.push(error)
        },
        onCaseStart(context) {
          published = context.task.context
          if (typeof platform.getPublicTestContext === 'function')
            assert.equal(platform.getPublicTestContext(published), published)
          if (client) {
            const boundary = client.createAsyncScope(
              { kind: 'attempt', context },
              (error) => late.push(error)
            )
            const token = boundary.run(() => client.captureCreatorScope())
            frame = { boundary, token, id: context.id }
            frames.set(context.id, frame)
          }
        },
        onCaseEnd() {
          frame?.boundary.close()
          if (frame) frames.delete(frame.id)
          frame = undefined
        },
      })
      await file.dispose()
      file = undefined
      const actualCases = result.cases.map((test) => ({
        name: test.name,
        status: test.status,
      }))
      const actual = {
        group,
        rows,
        cases: actualCases,
        rawCases: result.cases,
        errors: result.errors,
        late,
      }
      groups.push(actual)
      // Print each completed group first so a later comparison failure cannot
      // discard actual earlier rows or the intentional failed-case diagnostics.
      process.stdout.write(
        JSON.stringify({ phase: 'group', mode, ...actual }) + '\n'
      )
      assert.deepEqual(result.errors, [])
      assert.deepEqual(late, [])
      assert.deepEqual(rows, pristine[group].rows)
      assert.deepEqual(
        actualCases,
        pristine[group].cases.map((test) => ({
          name: test.name,
          status: test.status,
        }))
      )
      if (group === 'identity-fail')
        assert.equal(
          result.cases[0].errors[0].error.message,
          'intentional Browser listener identity failure'
        )
    }
    if (client)
      assert.throws(
        () => published.onTestFinished(() => {}),
        /originating file, hook or test scope/
      )
  } finally {
    console.log = originalLog
    frame?.boundary.close()
    frames.clear()
    await file?.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      groups,
      identityRecords: groups.reduce(
        (count, group) => count + group.rows.length,
        0
      ),
      cleaned: true,
    }) + '\n'
  )
}
main().catch((error) => {
  console.log = originalLog
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
