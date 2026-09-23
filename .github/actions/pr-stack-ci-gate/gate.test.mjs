import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
)
const gateWorkflowPath = path.join(
  root,
  '.github/workflows/pr_stack_optimizer.yml'
)
const buildWorkflowPath = path.join(
  root,
  '.github/workflows/build_and_test.yml'
)

function extractGateScript() {
  const lines = fs.readFileSync(gateWorkflowPath, 'utf8').split('\n')
  const marker = lines.findIndex((line) => line.trim() === 'script: |')
  assert.notEqual(marker, -1, 'gate github-script block should exist')
  return lines
    .slice(marker + 1)
    .map((line) => (line.startsWith('            ') ? line.slice(12) : line))
    .join('\n')
}

function pull(number, base, head, options = {}) {
  const repository = options.repository ?? 'vercel/next.js'
  return {
    number,
    state: 'open',
    base: { ref: base, repo: { full_name: 'vercel/next.js' } },
    head: {
      ref: head,
      sha: options.headSha ?? `head-${number}`,
      repo: { full_name: repository },
    },
    labels: (options.labels ?? []).map((name) => ({ name })),
    merge_commit_sha: options.mergeSha ?? `merge-${number}`,
  }
}

function linearStack(length) {
  return Array.from({ length }, (_, index) => {
    const number = index + 1
    return pull(
      number,
      index === 0 ? 'canary' : `branch-${index}`,
      `branch-${number}`
    )
  })
}

function createCore() {
  const outputs = new Map()
  const failures = []
  const warnings = []
  const logs = []
  const summaries = []
  const summary = {
    value: '',
    addRaw(value) {
      this.value += value
      return this
    },
    async write() {
      summaries.push(this.value)
      this.value = ''
    },
  }
  return {
    outputs,
    failures,
    warnings,
    logs,
    summaries,
    summary,
    setOutput(name, value) {
      outputs.set(name, String(value))
    },
    setFailed(message) {
      failures.push(message)
    },
    warning(message) {
      warnings.push(message)
    },
    info(message) {
      logs.push(message)
    },
  }
}

function createGithub(pulls, checks = {}, options = {}) {
  const byNumber = new Map(pulls.map((item) => [item.number, item]))
  const checkRefs = []
  let checkCall = 0
  const listRoute = async () => {}

  const github = {
    rest: {
      pulls: {
        list: listRoute,
        async get({ pull_number }) {
          if (options.getError) throw options.getError
          const item = byNumber.get(pull_number)
          assert.ok(item, `missing mocked PR #${pull_number}`)
          return { data: structuredClone(item) }
        },
      },
      checks: {
        async listForRef({ ref }) {
          checkRefs.push(ref)
          const value =
            typeof checks === 'function'
              ? checks(ref, checkCall++)
              : checks[ref]
          return { data: { check_runs: value ? [structuredClone(value)] : [] } }
        },
      },
    },
    async paginate(route, parameters) {
      assert.equal(route, listRoute)
      let result = pulls.filter((item) => item.state === 'open')
      if (parameters.base) {
        result = result.filter((item) => item.base.ref === parameters.base)
      }
      if (parameters.head) {
        const separator = parameters.head.indexOf(':')
        const owner = parameters.head.slice(0, separator)
        const branch = parameters.head.slice(separator + 1)
        result = result.filter(
          (item) =>
            item.head.ref === branch &&
            item.head.repo.full_name.startsWith(`${owner}/`)
        )
      }
      return structuredClone(result)
    },
  }

  return { github, checkRefs }
}

function check(id, conclusion, status = 'completed') {
  return {
    id,
    name: 'thank you, next',
    status,
    conclusion,
    html_url: `https://example.test/check/${id}`,
    app: { slug: 'github-actions' },
  }
}

async function runGate({
  pulls = [],
  current = 1,
  checks = {},
  eventName = 'pull_request',
  getError,
  advanceOnSleep = 5 * 60 * 1000,
} = {}) {
  const script = extractGateScript()
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const fn = new AsyncFunction('github', 'context', 'core', script)
  const core = createCore()
  const { github, checkRefs } = createGithub(pulls, checks, { getError })
  const context = {
    eventName,
    repo: { owner: 'vercel', repo: 'next.js' },
    payload: {
      repository: { full_name: 'vercel/next.js' },
      pull_request: pulls.find((item) => item.number === current) ?? {
        number: current,
      },
    },
  }

  const previousBypass = process.env.BYPASS_LABEL
  const realNow = Date.now
  const realTimeout = globalThis.setTimeout
  let now = 0
  process.env.BYPASS_LABEL = 'CI Bypass PR Stack Optimization'
  Date.now = () => now
  globalThis.setTimeout = (resolve, milliseconds) => {
    now += advanceOnSleep ?? milliseconds
    resolve()
    return 0
  }

  try {
    await fn(github, context, core)
  } finally {
    Date.now = realNow
    globalThis.setTimeout = realTimeout
    if (previousBypass === undefined) delete process.env.BYPASS_LABEL
    else process.env.BYPASS_LABEL = previousBypass
  }

  return { core, checkRefs }
}

// These tests replace global clock functions, so keep them serial.
test('non-PR runs open immediately', { concurrency: false }, async () => {
  const { core } = await runGate({ eventName: 'push' })
  assert.equal(core.outputs.get('skip'), 'false')
  assert.deepEqual(core.failures, [])
  assert.match(core.summaries.join('\n'), /push runs immediately/)
})

test(
  'fork and bypass PRs open immediately',
  { concurrency: false },
  async () => {
    const fork = pull(1, 'canary', 'fork-work', { repository: 'someone/fork' })
    const forkResult = await runGate({ pulls: [fork] })
    assert.deepEqual(forkResult.core.failures, [])
    assert.match(
      forkResult.core.summaries.join('\n'),
      /fork PRs always run immediately/
    )

    const bypass = pull(1, 'canary', 'work', {
      labels: ['CI Bypass PR Stack Optimization'],
    })
    const bypassResult = await runGate({ pulls: [bypass] })
    assert.deepEqual(bypassResult.core.failures, [])
    assert.match(
      bypassResult.core.summaries.join('\n'),
      /bypass label is present/
    )
  }
)

test(
  'first three and top PRs open immediately',
  { concurrency: false },
  async () => {
    const stack = linearStack(5)
    for (const number of [1, 2, 3, 5]) {
      const { core } = await runGate({ pulls: stack, current: number })
      assert.deepEqual(core.failures, [], `PR #${number} should open`)
    }
  }
)

test(
  'middle PR uses test-merge checks and opens on any success',
  { concurrency: false },
  async () => {
    const stack = linearStack(5)
    const checks = {
      'merge-3': check(3, null, 'in_progress'),
      'merge-2': check(2, 'success'),
      'merge-1': check(1, 'failure'),
    }
    const { core, checkRefs } = await runGate({
      pulls: stack,
      current: 4,
      checks,
    })
    assert.deepEqual(core.failures, [])
    assert.deepEqual(checkRefs, ['merge-3', 'merge-2', 'merge-1'])
    assert.ok(!checkRefs.some((ref) => ref.startsWith('head-')))
    assert.match(core.summaries.join('\n'), /PR #2 passed thank you, next/)
  }
)

test(
  'all three terminal failures fail the gate',
  { concurrency: false },
  async () => {
    const stack = linearStack(5)
    const checks = {
      'merge-3': check(3, 'failure'),
      'merge-2': check(2, 'cancelled'),
      'merge-1': check(1, 'skipped'),
    }
    const { core } = await runGate({ pulls: stack, current: 4, checks })
    assert.equal(core.failures.length, 1)
    assert.match(core.failures[0], /All three predecessor PRs/)
    assert.match(core.summaries.join('\n'), /Result: \*\*failed\*\*/)
  }
)

test(
  'waiting polls again and observes later success',
  { concurrency: false },
  async () => {
    const stack = linearStack(5)
    const calls = new Map()
    const checks = (ref) => {
      const count = calls.get(ref) ?? 0
      calls.set(ref, count + 1)
      if (ref === 'merge-3' && count > 0) return check(30, 'success')
      if (ref === 'merge-2') return check(20, 'failure')
      if (ref === 'merge-1') return check(10, 'cancelled')
      return null
    }
    const { core } = await runGate({ pulls: stack, current: 4, checks })
    assert.deepEqual(core.failures, [])
    assert.ok(calls.get('merge-3') >= 2)
    assert.match(core.summaries.join('\n'), /PR #3 passed thank you, next/)
  }
)

test(
  'five-hour unresolved wait fails open',
  { concurrency: false },
  async () => {
    const stack = linearStack(5)
    const { core } = await runGate({
      pulls: stack,
      current: 4,
      checks: {},
      advanceOnSleep: 5 * 60 * 60 * 1000,
    })
    assert.deepEqual(core.failures, [])
    assert.match(
      core.summaries.join('\n'),
      /Five-hour waiting deadline reached/
    )
  }
)

test(
  'API and ambiguous-chain errors fail open',
  { concurrency: false },
  async () => {
    const stack = linearStack(5)
    const apiResult = await runGate({
      pulls: stack,
      current: 4,
      getError: new Error('API unavailable'),
    })
    assert.deepEqual(apiResult.core.failures, [])
    assert.match(apiResult.core.warnings.join('\n'), /failing open/)

    const duplicate = pull(30, 'other', 'branch-3')
    const ambiguousResult = await runGate({
      pulls: [...stack, duplicate],
      current: 4,
    })
    assert.deepEqual(ambiguousResult.core.failures, [])
    assert.match(ambiguousResult.core.summaries.join('\n'), /multiple open PRs/)
  }
)

test('workflow structure keeps expensive roots behind the gate', () => {
  const gate = fs.readFileSync(gateWorkflowPath, 'utf8')
  const build = fs.readFileSync(buildWorkflowPath, 'utf8')

  for (const forbidden of [
    'withgraphite',
    'GRAPHITE_CI_OPTIMIZER_TOKEN',
    'pull_request.stack',
    '/stacks',
    'CI Bypass Graphite Optimization',
  ]) {
    assert.ok(!gate.includes(forbidden), `gate should not contain ${forbidden}`)
  }

  assert.match(gate, /permissions: \{\}/)
  assert.match(gate, /timeout-minutes: 360/)
  assert.match(gate, /POLL_INTERVAL_MS = 5 \* 60 \* 1000/)
  assert.match(gate, /WAIT_DEADLINE_MS = 5 \* 60 \* 60 \* 1000/)
  assert.match(gate, /checks: read/)
  assert.match(gate, /pull-requests: read/)
  assert.ok(!gate.includes('secrets:'))

  for (const job of ['changes', 'build-next', 'validate-docs-links']) {
    const block = build.match(
      new RegExp(
        `^  ${job}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:|(?![\\s\\S]))`,
        'm'
      )
    )
    assert.ok(block, `missing ${job} job`)
    assert.match(block[0], /needs: \['optimize-ci'\]/)
  }

  const metadata = build.match(
    /^  pr-ci-metadata:\n([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:|(?![\s\S]))/m
  )
  assert.ok(metadata)
  assert.ok(!metadata[0].includes('needs:'))
  assert.match(build, /cancel-in-progress: true/)
  assert.match(build, /types: \[opened, synchronize\]/)
  assert.match(
    build,
    /node --test \.github\/actions\/pr-stack-ci-gate\/gate\.test\.mjs/
  )

  const optimizeCall = build.match(
    /^  optimize-ci:\n([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:|(?![\s\S]))/m
  )
  assert.ok(optimizeCall)
  assert.ok(!optimizeCall[0].includes('secrets: inherit'))

  const aggregate = build.match(
    /^  tests-pass:\n([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:|(?![\s\S]))/m
  )
  assert.ok(aggregate)
  assert.match(aggregate[0], /- optimize-ci/)
  assert.match(aggregate[0], /contains\(needs\.\*\.result, 'failure'\)/)
  assert.match(aggregate[0], /contains\(needs\.\*\.result, 'cancelled'\)/)
})
