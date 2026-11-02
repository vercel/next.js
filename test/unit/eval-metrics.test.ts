import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

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
