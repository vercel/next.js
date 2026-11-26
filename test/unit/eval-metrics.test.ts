import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'

const repository = path.join(__dirname, '../..')
const runner = fs.readFileSync(path.join(repository, 'run-evals.js'), 'utf8')
const fixture = 'agent-062-pokedex-dev-loop'
const { evaluateEffortGate } = require('../../evals/lib/effort-gate')

function run(
  args: string[],
  {
    collectorStatus = 0,
    skillTokens = 50 as number | null,
    skillStatus = 'passed',
    dependsOnNext = false,
  } = {}
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-metrics-'))
  const preStackTarball = path.join(root, 'pre-stack-next.tgz')
  fs.writeFileSync(preStackTarball, '')
  args = args.map((arg) =>
    arg === '__PRE_STACK_TARBALL__' ? preStackTarball : arg
  )
  const calls: Array<{ command: string; args: string[] }> = []
  const write = (file: string, value: unknown) => {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(value))
  }
  write(
    `evals/evals/${fixture}/package.json`,
    dependsOnNext ? { dependencies: { next: '*' } } : { private: true }
  )
  if (dependsOnNext)
    fs.mkdirSync(path.join(root, 'packages/next/dist'), { recursive: true })
  write('evals/eval.suites.json', { regression: [fixture] })
  const effortGate = args.includes('--effort-gate')
  write('evals/eval.config.json', {
    [fixture]: {
      publish: false,
      skills: ['next-dev-loop'],
      metrics: effortGate ? 'effort' : 'pokedex',
    },
  })
  write(`evals/metrics/${effortGate ? 'effort' : 'pokedex'}.mjs`, {})
  let exitCode: number | undefined
  let agentRun = 0
  const exit = new Error('runner exited')
  try {
    vm.runInNewContext(runner, {
      __dirname: root,
      console: { log() {}, error() {} },
      process: {
        argv: [
          'node',
          'run-evals.js',
          fixture,
          ...(effortGate
            ? []
            : ['--variant', 'baseline', '--variant', 'skills']),
          ...args,
        ],
        env: {},
        execPath: process.execPath,
        exit(code: number) {
          exitCode = code
          throw exit
        },
      },
      require(name: string) {
        if (name === './evals/lib/pack')
          return {
            packPackage(_: string, target: string) {
              if (!dependsOnNext)
                throw new Error('Pinned fixture must not pack Next.js')
              fs.mkdirSync(path.dirname(target), { recursive: true })
              fs.writeFileSync(target, '')
            },
          }
        if (name === './evals/lib/environment') return { linkEnvironment() {} }
        if (name === './evals/lib/effort-gate')
          return require(path.join(repository, 'evals/lib/effort-gate'))
        if (name === 'child_process')
          return {
            spawnSync(command: string, args: string[]) {
              calls.push({ command, args })
              if (args[0] === 'run') {
                agentRun++
                const resultVariants = effortGate
                  ? args.slice(1, -1)
                  : ['baseline', 'skills']
                for (const variant of resultVariants) {
                  const timestamp = effortGate
                    ? `2026-11-${String(agentRun).padStart(2, '0')}`
                    : '2026-11-02'
                  write(
                    `evals/results/${variant}/${timestamp}/${fixture}/run-1/result.json`,
                    { status: 'passed' }
                  )
                }
              }
              if (effortGate && args.includes('collect')) {
                const directory = args[3]
                write(
                  path.relative(root, path.join(directory, 'metrics.json')),
                  {
                    status: directory.split(path.sep).includes('skills')
                      ? skillStatus
                      : 'passed',
                    inputTokens: directory.split(path.sep).includes('baseline')
                      ? 100
                      : directory.split(path.sep).includes('agents-md')
                        ? 60
                        : skillTokens,
                  }
                )
              }
              return {
                status: args.includes('collect')
                  ? collectorStatus
                  : effortGate && skillStatus === 'failed'
                    ? 1
                    : 0,
              }
            },
          }
        return require(name)
      },
    })
  } catch (error) {
    if (error !== exit) {
      fs.rmSync(root, { recursive: true, force: true })
      throw error
    }
  }
  return { root, calls, exitCode }
}

describe('normal eval metrics workflow', () => {
  it('uses the regular runner and collects each saved variant without changing scores', () => {
    const { root, calls, exitCode } = run(
      [
        '--metrics',
        '--agent',
        'vercel-ai-gateway/codex',
        '--model',
        'openai/gpt-6-sol',
      ],
      { collectorStatus: 1 }
    )
    try {
      expect(calls[0].args).toEqual(['run', 'baseline', 'skills', '--force'])
      expect(
        calls.filter((call) => call.args.includes('collect'))
      ).toHaveLength(2)
      expect(exitCode).toBe(1)
      for (const variant of ['baseline', 'skills']) {
        const config = fs.readFileSync(
          path.join(root, `evals/experiments/${variant}.ts`),
          'utf8'
        )
        expect(config).toContain("copyFiles: 'all'")
        expect(config).toContain('recordAgentTime(sandbox)')
        expect(config).toContain('"openai/gpt-6-sol"')
        expect(
          JSON.parse(
            fs.readFileSync(
              path.join(
                root,
                `evals/results/${variant}/2026-11-02/${fixture}/run-1/result.json`
              ),
              'utf8'
            )
          ).status
        ).toBe('passed')
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([[], ['--metrics', '--dry']])(
    'keeps ordinary runs and previews free of metric collection: %j',
    (...args: string[]) => {
      const { root, calls, exitCode } = run(args)
      try {
        expect(exitCode).toBe(0)
        expect(calls).toHaveLength(1)
        expect(calls[0].args.includes('collect')).toBe(false)
      } finally {
        fs.rmSync(root, { recursive: true, force: true })
      }
    }
  )
})

describe('effort gate', () => {
  it('leaves samples without token counts out of the median', () => {
    expect(
      evaluateEffortGate({
        baseline: [
          { inputTokens: 100, status: 'passed' },
          { inputTokens: null, status: 'failed' },
        ],
        'agents-md': [
          { inputTokens: 60, status: 'passed' },
          { inputTokens: 60, status: 'passed' },
        ],
        skills: [
          { inputTokens: null, status: 'failed' },
          { inputTokens: null, status: 'failed' },
        ],
      })
    ).toMatchObject({
      passed: false,
      variants: {
        baseline: { medianInputTokens: 100, passes: 1 },
        'agents-md': { reduction: 0.4 },
        skills: { medianInputTokens: null, reduction: null },
      },
    })
  })

  it('averages the middle values for an even sample count', () => {
    const samples = (inputTokens: number[]) =>
      inputTokens.map((tokens) => ({ inputTokens: tokens, status: 'passed' }))

    expect(
      evaluateEffortGate({
        baseline: samples([100, 200]),
        'agents-md': samples([50, 100]),
        skills: samples([25, 75]),
      })
    ).toMatchObject({
      variants: {
        baseline: { medianInputTokens: 150 },
        'agents-md': { medianInputTokens: 75 },
        skills: { medianInputTokens: 50 },
      },
    })
  })

  it('compares five sequential baseline, agents-md, and skill samples', () => {
    const { root, calls, exitCode } = run(['--effort-gate'], {
      dependsOnNext: true,
    })
    try {
      expect(calls.filter((call) => call.args[0] === 'run')).toHaveLength(5)
      expect(
        calls.filter((call) => call.args.includes('collect'))
      ).toHaveLength(15)
      expect(exitCode).toBe(0)
      const reports = fs.readdirSync(
        path.join(root, 'evals/results/effort-gate')
      )
      expect(reports).toHaveLength(1)
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(root, 'evals/results/effort-gate', reports[0]),
            'utf8'
          )
        )
      ).toMatchObject({
        variants: { 'agents-md': { medianInputTokens: 60, passes: 5 } },
        samples: { 'agents-md': expect.any(Array) },
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps effort samples when the collector fails after writing metrics', () => {
    const { root, exitCode } = run(['--effort-gate'], { collectorStatus: 1 })
    try {
      expect(exitCode).toBe(0)
      const [report] = fs.readdirSync(
        path.join(root, 'evals/results/effort-gate')
      )
      const { samples } = JSON.parse(
        fs.readFileSync(
          path.join(root, 'evals/results/effort-gate', report),
          'utf8'
        )
      )
      expect(samples.skills).toHaveLength(5)
      expect(samples.skills[0]).toMatchObject({ collectorFailed: true })
      // Non-Next fixtures skip agents-md, which would match baseline.
      expect(samples).not.toHaveProperty('agents-md')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('prepends a pre-stack package to the effort comparison', () => {
    const { root, calls, exitCode } = run(
      [
        '--effort-gate',
        '--effort-samples',
        '2',
        '--effort-pre-stack-tarball',
        '__PRE_STACK_TARBALL__',
      ],
      { dependsOnNext: true }
    )
    try {
      expect(
        calls.filter((call) => call.args.includes('collect'))
      ).toHaveLength(8)
      expect(exitCode).toBe(0)
      const config = fs.readFileSync(
        path.join(root, 'evals/experiments/pre-stack.ts'),
        'utf8'
      )
      expect(config).toContain(
        JSON.stringify(path.join(root, 'pre-stack-next.tgz'))
      )
      const [report] = fs.readdirSync(
        path.join(root, 'evals/results/effort-gate')
      )
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(root, 'evals/results/effort-gate', report),
            'utf8'
          )
        ).samples
      ).toMatchObject({ 'pre-stack': expect.any(Array) })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a pre-stack tarball for a fixture that does not use Next.js', () => {
    expect(() =>
      run([
        '--effort-gate',
        '--effort-pre-stack-tarball',
        '__PRE_STACK_TARBALL__',
      ])
    ).toThrow('requires a fixture that depends on Next.js')
  })

  it.each([
    ['token reduction', 80, 'passed'],
    ['pass rate', 30, 'failed'],
    ['token count', null, 'failed'],
  ])('fails when the skill misses the %s gate', (_, tokens, status) => {
    const { root, exitCode } = run(['--effort-gate'], {
      skillTokens: tokens,
      skillStatus: status,
    })
    try {
      expect(exitCode).toBe(1)
      expect(
        fs.readdirSync(path.join(root, 'evals/results/effort-gate'))
      ).toHaveLength(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('saved eval effort', () => {
  it('deduplicates Claude native messages and prefers a cumulative result when present', () => {
    const script = `
      import { effort } from './evals/lib/effort.mjs';
      const message = {type:'assistant',message:{id:'msg-1',usage:{input_tokens:100,output_tokens:20,cache_read_input_tokens:80,cache_creation_input_tokens:10}}};
      const raw = [message, message, {...message,message:{...message.message,id:'msg-2'}}].map(JSON.stringify).join('\\n');
      const pricing = {input:1,input_cache_read:0.1,input_cache_write:2,output:3};
      console.log(JSON.stringify([effort(raw,pricing),effort(raw+'\\n'+JSON.stringify({type:'result',usage:{input_tokens:50,output_tokens:5}}),pricing)]));
    `
    const results = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: repository,
        encoding: 'utf8',
      })
    )
    expect(results[0]).toMatchObject({
      inputTokens: 380,
      cachedInputTokens: 160,
      cacheWriteInputTokens: 20,
      outputTokens: 40,
      estimatedModelUsd: 376,
    })
    expect(results[1]).toMatchObject({
      inputTokens: 50,
      outputTokens: 5,
      estimatedModelUsd: 65,
    })
  })

  it('keeps saved pricing in combined reports and computes missing measurements', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-report-'))
    try {
      for (const name of ['saved', 'uncollected']) {
        fs.mkdirSync(path.join(root, name))
        fs.writeFileSync(
          path.join(root, name, 'result.json'),
          JSON.stringify({ model: 'test', status: 'failed', duration: 5 })
        )
      }
      fs.writeFileSync(
        path.join(root, 'saved/metrics.json'),
        JSON.stringify({
          status: 'failed',
          inputTokens: 200,
          estimatedModelUsd: 0.123,
        })
      )
      fs.writeFileSync(
        path.join(root, 'uncollected/transcript-raw.jsonl'),
        JSON.stringify({
          type: 'turn.completed',
          usage: {
            input_tokens: 100,
            cached_input_tokens: 80,
            output_tokens: 2,
          },
        })
      )
      const results = JSON.parse(
        execFileSync(
          process.execPath,
          ['evals/metrics/report.mjs', 'report', root],
          { cwd: repository, encoding: 'utf8' }
        )
      )
      expect(
        results.find((r: { run: string }) => path.basename(r.run) === 'saved')
      ).toMatchObject({
        status: 'failed',
        estimatedModelUsd: 0.123,
        inputTokens: 200,
      })
      expect(
        results.find(
          (r: { run: string }) => path.basename(r.run) === 'uncollected'
        )
      ).toMatchObject({
        status: 'failed',
        inputTokens: 100,
        estimatedModelUsd: null,
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
