import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'

const repository = path.join(__dirname, '../..')
const runner = fs.readFileSync(path.join(repository, 'run-evals.js'), 'utf8')
const fixture = 'agent-062-pokedex-dev-loop'

function run(args: string[], collectorStatus = 0) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-metrics-'))
  const calls: Array<{ command: string; args: string[] }> = []
  const write = (file: string, value: unknown) => {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(value))
  }
  write(`evals/evals/${fixture}/package.json`, { private: true })
  write('evals/eval.suites.json', { regression: [fixture] })
  write('evals/eval.config.json', {
    [fixture]: {
      publish: false,
      skills: ['next-dev-loop'],
      metrics: 'pokedex',
    },
  })
  write('evals/metrics/pokedex.mjs', {})
  let exitCode: number | undefined
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
          '--variant',
          'baseline',
          '--variant',
          'skills',
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
            packPackage() {
              throw new Error('Pinned fixture must not pack Next.js')
            },
          }
        if (name === './evals/lib/environment') return { linkEnvironment() {} }
        if (name === 'child_process')
          return {
            spawnSync(command: string, args: string[]) {
              calls.push({ command, args })
              if (args[0] === 'run') {
                for (const variant of ['baseline', 'skills']) {
                  write(
                    `evals/results/${variant}/2026-11-02/${fixture}/run-1/result.json`,
                    { status: 'passed' }
                  )
                }
              }
              return { status: args.includes('collect') ? collectorStatus : 0 }
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
      1
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
