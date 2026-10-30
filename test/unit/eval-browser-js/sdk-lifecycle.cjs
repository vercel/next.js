const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')
const { createRequire } = require('node:module')
const assert = require('node:assert/strict')
const taskRequire = createRequire(process.cwd() + '/package.json')
const { build } = taskRequire('esbuild')
const sdk = path.dirname(taskRequire.resolve('@vercel/agent-eval/package.json'))
const directory = fs.mkdtempSync(
  path.join(tmpdir(), 'next-eval-sdk-lifecycle-')
)
const fixture = path.join(directory, 'fixture')
const modulePath = path.join(directory, 'agents/plugin/orchestrator.mjs')
const sandboxUrl = pathToFileURL(path.join(sdk, 'dist/lib/sandbox.js')).href
const state = {
  snapshots: new Map(),
  initial: [],
  agentRuns: 0,
  validations: 0,
  installs: 0,
}
globalThis.__evalSdkTest = state
function makeSandbox(options) {
  const files = new Map(
    options.snapshotId ? state.snapshots.get(options.snapshotId) : []
  )
  return {
    files,
    sandboxId: 'local-test',
    getWorkingDirectory: () => fixture,
    setWorkingDirectory: () => {},
    uploadFiles: async (inputs) => {
      for (const file of inputs) files.set(file.path, file.content.toString())
    },
    writeFiles: async (inputs) => {
      for (const [name, source] of Object.entries(inputs))
        files.set(name, source)
    },
    readFile: async (name) => files.get(name),
    stop: async () => {},
    snapshot: async () => {
      assert(!files.has('EVAL.ts'))
      assert(![...files.keys()].some((name) => name.includes('__eval__/')))
      state.snapshots.set('prepared', new Map(files))
      return {
        snapshotId: 'prepared',
        delete: async () => state.snapshots.delete('prepared'),
      }
    },
    runCommand: async (cmd, args, options = {}) => {
      assert.equal(options.env.VALIDATION_FLAG, undefined)
      if (cmd === 'install-check') {
        state.installs++
        return { exitCode: 0 }
      }
      assert.equal(args[0], '__agent_eval__/run.mjs')
      assert.equal(options.env.PUBLIC_FLAG, '1')
      assert(!files.has('EVAL.ts'))
      assert(![...files.keys()].some((name) => name.includes('__eval__/')))
      state.agentRuns++
      files.set('EVAL.ts', 'tampered')
      files.set('__eval__/measurement.ts', 'tampered')
      files.set(
        '__agent_eval__/agent-result.json',
        JSON.stringify({ ok: true, output: 'stub', transcript: '' })
      )
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
}
state.makeSandbox = makeSandbox
const mocks = {
  '../../sandbox.js': `import { collectLocalFiles, splitTestFiles } from ${JSON.stringify(sandboxUrl)};
    export { collectLocalFiles, splitTestFiles };
    export const createSandbox = async options => globalThis.__evalSdkTest.makeSandbox(options);
    export const verifyNoTestFiles = async sandbox => { if ([...sandbox.files.keys()].some(name => name === 'EVAL.ts' || name.includes('__eval__/'))) throw Error('Leaked grader'); };`,
  '../shared.js': `import assert from 'node:assert/strict';
    export const initGitAndCommit = async sandbox => { const files = [...sandbox.files.keys()]; assert.deepEqual(files, ['app/page.tsx']); globalThis.__evalSdkTest.initial.push(files); };
    export const prepareNeutralWorkspace = async sandbox => ({ cwd: sandbox.getWorkingDirectory(), env: {} });
    export const createVitestConfig = async sandbox => { assert.equal(sandbox.files.get('EVAL.ts'), 'trusted bundled grader'); assert.equal(sandbox.files.get('__eval__/measurement.ts'), 'trusted original measurement'); };
    export const runValidation = async (sandbox, scripts, mode, env) => { assert.equal(env.VALIDATION_FLAG, '1'); assert.equal(env.PUBLIC_FLAG, '1'); assert.equal(sandbox.files.get('__agent_eval__/baseline.json'), 'trusted baseline'); globalThis.__evalSdkTest.validations++; return { allPassed: true, scripts: {} }; };
    export const captureGeneratedFiles = async () => ({ generatedFiles: {}, deletedFiles: [] });
    export const injectTranscriptContext = async () => {};
    export const resolveAgentApiKey = () => undefined;
    export const EVAL_HELPER_PATH = '__agent_eval__/eval-helper.mjs';
    export const JUDGE_TRANSCRIPT_FILE = '__agent_eval__/transcript';
    export const JUDGE_CONFIG_PATH = '__agent_eval__/judge-config';
    export const JUDGE_RUNNER_PATH = '__agent_eval__/judge-runner';`,
  '../redact.js': 'export const redactRunResult = result => result;',
  '../registry.js':
    'export const getAgent = () => { throw Error("Unexpected judge"); };',
  './contract.js':
    'export const assertBundledSkillsControl = () => {}; export const assertCrossAgentJudgeSupport = () => {}; export const assertWebResearchControl = () => {};',
}
;(async () => {
  fs.mkdirSync(path.join(fixture, 'app'), { recursive: true })
  fs.mkdirSync(path.join(fixture, '__eval__'))
  fs.writeFileSync(path.join(fixture, 'app/page.tsx'), 'app')
  fs.writeFileSync(path.join(fixture, 'EVAL.ts'), 'original grader')
  fs.writeFileSync(
    path.join(fixture, '__eval__/measurement.ts'),
    'trusted original measurement'
  )
  fs.mkdirSync(path.dirname(modulePath), { recursive: true })
  fs.writeFileSync(path.join(directory, 'agents/eval-helper.mjs'), '')
  fs.writeFileSync(path.join(directory, 'runner.mjs'), '')
  await build({
    entryPoints: [path.join(sdk, 'dist/lib/agents/plugin/orchestrator.js')],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    external: [sandboxUrl],
    plugins: [
      {
        name: 'offline-sdk-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /./ }, (args) =>
            args.importer.endsWith('/plugin/orchestrator.js') &&
            mocks[args.path]
              ? { path: args.path, namespace: 'sdk-test' }
              : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'sdk-test' }, (args) => ({
            contents: mocks[args.path],
            loader: 'js',
          }))
        },
      },
    ],
  })
  const { runWithDefinition } = await import(pathToFileURL(modulePath).href)
  const def = {
    name: 'offline',
    displayName: 'offline',
    o11yAgentName: 'offline',
    runnerPath: path.join(directory, 'runner.mjs'),
    install: () => [{ kind: 'command', cmd: 'install-check', args: [] }],
    configFiles: () => [],
    authEnv: () => ({}),
  }
  const options = {
    model: 'offline',
    prompt: 'offline',
    validation: 'vitest',
    setup: async () => ({
      env: { PUBLIC_FLAG: '1' },
      validationFiles: {
        'EVAL.ts': 'trusted bundled grader',
        '__agent_eval__/baseline.json': 'trusted baseline',
      },
      validationEnv: { VALIDATION_FLAG: '1' },
    }),
  }
  delete process.env.AGENT_EVAL_PREPARE_FIXTURE_ONCE
  const regular = await runWithDefinition(def, fixture, options)
  assert.equal(regular.success, true, regular.error)
  process.env.AGENT_EVAL_PREPARE_FIXTURE_ONCE = '1'
  process.env.AGENT_EVAL_PREPARED_FIXTURE_CONSUMERS = '1'
  const prepared = await runWithDefinition(def, fixture, options)
  assert.equal(prepared.success, true, prepared.error)
  assert.equal(state.agentRuns, 2)
  assert.equal(state.validations, 2)
  assert.equal(state.initial.length, 2)
  assert.equal(state.installs, 1)

  fs.symlinkSync(
    path.join(process.cwd(), 'node_modules'),
    path.join(directory, 'node_modules')
  )
  const hooksPath = path.join(directory, 'browser-js-hooks.mjs')
  await build({
    entryPoints: [
      path.join(process.cwd(), 'evals/lib/bundle-optimizer/hooks.ts'),
    ],
    outfile: hooksPath,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
  })
  const { createBrowserJsHooks } = await import(pathToFileURL(hooksPath).href)
  const measurement = {
    before: {
      initial: {
        encodedBytes: 200,
        decodedBytes: 400,
        requests: [{ url: '/before.js' }],
      },
    },
    after: {
      initial: {
        encodedBytes: 100,
        decodedBytes: 200,
        requests: [{ url: '/after.js' }],
      },
    },
    budgetBytes: 150,
    savedBytes: 100,
  }
  const evalName = 'agent-059-bundle-optimizer-next-dynamic'
  const hooks = createBrowserJsHooks({ [evalName]: 'renamed-package' }, [])
  const files = new Map()
  const sandbox = {
    readFile: async (name) =>
      name === 'package.json'
        ? JSON.stringify({ name: 'renamed-package' })
        : JSON.stringify({
            numTotalTests: 1,
            testResults: [
              {
                assertionResults: [
                  {
                    fullName: 'byte budget',
                    status: 'failed',
                    failureMessages: ['Over budget'],
                  },
                ],
              },
            ],
          }),
    writeFiles: async (inputs) => {
      for (const [name, content] of Object.entries(inputs))
        files.set(name, content)
    },
    runCommand: async (command, args, options) => {
      if (command === 'npx') {
        assert.equal(options.env.NEXT_EVAL_BROWSER_JS_PHASE, 'before')
        assert(files.get('EVAL.ts').includes('editorLoaded'))
        return {
          exitCode: 1,
          stdout: 'NEXT_EVAL_BROWSER_JS_RESULT:' + JSON.stringify(measurement),
        }
      }
      assert.equal(command, 'node')
      assert(args.includes('--eval'))
      files.clear()
      return { exitCode: 0 }
    },
  }
  const cwd = process.cwd()
  try {
    process.chdir(path.join(cwd, 'evals'))
    const prepared = await hooks.setup(sandbox)
    assert.equal(files.size, 0)
    assert(prepared.validationFiles['EVAL.ts'].includes('editorLoaded'))
    const before = JSON.parse(
      prepared.validationEnv.NEXT_EVAL_BROWSER_JS_BEFORE
    )
    assert.equal(before.initial.encodedBytes, 200)
    assert.equal(before.checks[0].status, 'failed')
  } finally {
    process.chdir(cwd)
  }
  assert.equal(
    await hooks.setup({ readFile: async () => '{"name":"unrelated"}' }),
    undefined
  )
  const runData = {
    result: { status: 'passed' },
    outputContent: {
      eval: 'NEXT_EVAL_BROWSER_JS_RESULT:' + JSON.stringify(measurement),
    },
  }
  const context = { fixture: { name: evalName }, runData }
  const analyzed = await hooks.onRunComplete(context)
  assert.deepEqual(analyzed.result.analysis.browserJs, measurement)
  assert.equal(analyzed.result.status, 'passed')
  assert.equal(
    await hooks.onRunComplete({ fixture: { name: 'unrelated' }, runData }),
    runData
  )
  const required = createBrowserJsHooks({ [evalName]: 'renamed-package' }, [
    'next-bundle-optimizer',
  ])
  const missingSkill = await required.onRunComplete(context)
  assert.equal(missingSkill.result.status, 'failed')
  assert.match(missingSkill.result.error, /skill was not invoked/)
  console.log(
    'SDK grader isolation, prepared-snapshot validation, and configured browser measurement hooks pass'
  )
})()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => fs.rmSync(directory, { recursive: true, force: true }))
