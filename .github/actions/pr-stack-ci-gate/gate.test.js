const fs = require('node:fs')
const path = require('node:path')
const { runGate: gate } = require('./src/gate.ts')
const realCheck = require('./fixtures/successful-check.json')

const root = path.resolve(__dirname, '../../..')

function pull(number, base, head, options = {}) {
  return {
    number,
    state: 'open',
    base: { ref: base, sha: options.baseSha ?? `base-${base}` },
    head: {
      ref: head,
      sha: options.headSha ?? `head-${number}`,
      repo: { full_name: options.repository ?? 'vercel/next.js' },
    },
    labels: (options.labels ?? []).map((name) => ({ name })),
  }
}

function linearStack(length) {
  return Array.from({ length }, (_, index) =>
    pull(index + 1, index ? `branch-${index}` : 'canary', `branch-${index + 1}`)
  )
}

function check(id, conclusion, status = 'completed', overrides = {}) {
  return {
    id,
    name: 'thank you, next',
    status,
    conclusion,
    html_url: `https://example.test/check/${id}`,
    app: { slug: 'github-actions' },
    ...overrides,
  }
}

function coreMock() {
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

function githubMock(pulls, checks, options) {
  const calls = { get: 0, list: 0, checks: 0, refs: [] }
  const route = () => {}
  const github = {
    rest: {
      pulls: {
        list: route,
        async get({ pull_number }) {
          calls.get++
          const error = options.getError?.(pull_number, calls.get)
          if (error) throw error
          const result = pulls.find((item) => item.number === pull_number)
          if (!result) throw new Error(`Missing mock PR #${pull_number}`)
          return { data: structuredClone(result) }
        },
      },
      checks: {
        async listForRef({ ref }) {
          calls.checks++
          calls.refs.push(ref)
          const value =
            typeof checks === 'function'
              ? checks(ref, calls.checks)
              : checks[ref]
          const candidates = (
            Array.isArray(value) ? value : value ? [value] : []
          ).map((item) => structuredClone(item))
          for (const candidate of candidates) {
            if (!Object.hasOwn(candidate, 'head_sha')) candidate.head_sha = ref
            if (!Object.hasOwn(candidate, 'pull_requests')) {
              candidate.pull_requests = pulls
                .filter((item) => item.head.sha === ref)
                .map((item) => ({
                  number: item.number,
                  head: { sha: item.head.sha },
                  base: { ref: item.base.ref, sha: item.base.sha },
                }))
            }
          }
          return { data: { check_runs: candidates } }
        },
      },
    },
    async paginate(input, params) {
      expect(input).toBe(route)
      calls.list++
      let result = pulls.filter((item) => item.state === 'open')
      if (params.base)
        result = result.filter((item) => item.base.ref === params.base)
      if (params.head) {
        const [owner, ...parts] = params.head.split(':')
        const branch = parts.join(':')
        result = result.filter(
          (item) =>
            item.head.ref === branch &&
            item.head.repo.full_name.startsWith(`${owner}/`)
        )
      }
      return structuredClone(result)
    },
  }
  return { github, calls }
}

async function run({
  pulls = [],
  current = 1,
  checks = {},
  eventName = 'pull_request',
  getError,
} = {}) {
  jest.useFakeTimers({ now: new Date(0) })
  const core = coreMock()
  const { github, calls } = githubMock(pulls, checks, { getError })
  const context = {
    repo: { owner: 'vercel', repo: 'next.js' },
    eventName,
    payload: {
      repository: { full_name: 'vercel/next.js' },
      ...(eventName === 'pull_request'
        ? { pull_request: { number: current } }
        : {}),
    },
  }
  const previous = process.env.BYPASS_LABEL
  process.env.BYPASS_LABEL = 'CI Bypass PR Stack Optimization'
  let settled = false
  try {
    const result = gate({ core, github, context }).finally(() => {
      settled = true
    })
    for (let i = 0; i < 80 && !settled; i++) {
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000)
    }
    if (!settled) throw new Error('Gate did not finish within 80 fake polls')
    await result
  } finally {
    jest.useRealTimers()
    if (previous === undefined) delete process.env.BYPASS_LABEL
    else process.env.BYPASS_LABEL = previous
  }
  return { core, calls }
}

test('non-PR runs open immediately', async () => {
  const { core } = await run({ eventName: 'push' })
  expect(core.outputs.get('skip')).toBe('false')
  expect(core.failures).toEqual([])
  expect(core.warnings).toEqual([])
  expect(core.summaries.join('\n')).toMatch(
    /PR: #n\/a.*|push runs immediately/s
  )
})

test('fork and bypass PRs open immediately', async () => {
  const fork = await run({
    pulls: [pull(1, 'canary', 'fork-work', { repository: 'someone/fork' })],
  })
  expect(fork.calls.checks).toBe(0)
  expect(fork.core.summaries.join('\n')).toContain(
    'fork PRs always run immediately'
  )
  const bypass = await run({
    pulls: [
      pull(1, 'canary', 'work', {
        labels: ['CI Bypass PR Stack Optimization'],
      }),
    ],
  })
  expect(bypass.core.summaries.join('\n')).toContain('bypass label is present')
})

test('first three and the top/leaf PR open immediately', async () => {
  const stack = linearStack(5)
  for (const current of [1, 2, 3, 5]) {
    const { core } = await run({ pulls: stack, current })
    expect(core.failures).toEqual([])
  }
})

test('older success releases even when nearer predecessor is pending', async () => {
  const stack = linearStack(5)
  const { core, calls } = await run({
    pulls: stack,
    current: 4,
    checks: {
      'head-3': check(3, null, 'in_progress'),
      'head-2': check(2, 'success'),
      'head-1': check(1, 'failure'),
    },
  })
  expect(core.failures).toEqual([])
  expect(calls.refs).toEqual(['head-3', 'head-2', 'head-1', 'head-2'])
  expect(core.summaries.join('\n')).toContain('PR #2 passed thank you, next')
})

test('a real current-head and current-base check association releases', async () => {
  // Captured from #99095's passing required check; only branch-chain wiring
  // uses synthetic PRs. This guards the live REST response shape.
  const stack = linearStack(5)
  stack[0].head.ref = realCheck.pull_requests[0].base.ref
  stack[1].number = realCheck.pull_requests[0].number
  stack[1].base.ref = realCheck.pull_requests[0].base.ref
  stack[1].base.sha = realCheck.pull_requests[0].base.sha
  stack[1].head.sha = realCheck.head_sha
  const result = await run({
    pulls: stack,
    current: 4,
    checks: { [realCheck.head_sha]: realCheck },
  })
  expect(result.core.failures).toEqual([])
  expect(result.core.summaries.join('\n')).toContain('PR #99095 passed')
})

test('three terminal failures fail the gate without running expensive jobs', async () => {
  const { core } = await run({
    pulls: linearStack(5),
    current: 4,
    checks: {
      'head-3': check(3, 'failure'),
      'head-2': check(2, 'cancelled'),
      'head-1': check(1, 'skipped'),
    },
  })
  expect(core.failures).toHaveLength(1)
  expect(core.failures[0]).toMatch(/All three predecessor PRs/)
  expect(core.summaries.join('\n')).toMatch(/Result: \*\*failed\*\*/)
})

test('an old-base success cannot release the gate', async () => {
  const stack = linearStack(5)
  const staleSuccess = check(200, 'success', 'completed', {
    pull_requests: [
      {
        number: 3,
        head: { sha: 'head-3' },
        base: { ref: 'branch-2', sha: 'old-base' },
      },
    ],
  })
  const { core } = await run({
    pulls: stack,
    current: 4,
    checks: {
      'head-3': [staleSuccess, check(100, 'failure')],
      'head-2': check(2, 'cancelled'),
      'head-1': check(1, 'failure'),
    },
  })
  expect(core.failures).toHaveLength(1)
})

test.each([
  { head_sha: 'old-head-sha' },
  {
    pull_requests: [
      {
        number: 99,
        head: { sha: 'head-3' },
        base: { ref: 'branch-2', sha: 'base-branch-2' },
      },
    ],
  },
  { pull_requests: [] },
  { app: { slug: 'untrusted-app' } },
])('unrelated or stale check does not release (%j)', async (overrides) => {
  const { core } = await run({
    pulls: linearStack(5),
    current: 4,
    checks: { 'head-3': check(3, 'success', 'completed', overrides) },
  })
  expect(core.failures).toEqual([])
  expect(core.summaries.join('\n')).toContain(
    'Five-hour waiting deadline reached'
  )
})

test('a later successful predecessor releases within a five-minute poll', async () => {
  const calls = new Map()
  const checks = (ref) => {
    const count = calls.get(ref) ?? 0
    calls.set(ref, count + 1)
    if (ref === 'head-3' && count > 0) return check(30, 'success')
    if (ref === 'head-2') return check(20, 'failure')
    return null
  }
  const result = await run({ pulls: linearStack(5), current: 4, checks })
  expect(result.core.failures).toEqual([])
  expect(result.core.summaries.join('\n')).toContain(
    'PR #3 passed thank you, next'
  )
})

test('a failed predecessor may succeed on a later rerun', async () => {
  let reads = 0
  const result = await run({
    pulls: linearStack(5),
    current: 4,
    checks: (ref) => {
      if (ref === 'head-1')
        return ++reads > 1 ? check(100, 'success') : check(1, 'failure')
      if (ref === 'head-2') return check(2, 'failure')
      return null
    },
  })
  expect(result.core.summaries.join('\n')).toContain(
    'PR #1 passed thank you, next'
  )
})

test('steady pending polls save three REST requests without losing topology refresh', async () => {
  const snapshots = []
  const stack = linearStack(5)
  const result = await run({
    pulls: stack,
    current: 4,
    checks: (ref, nth) => {
      if (nth % 3 === 0) snapshots.push(nth)
      // After two full waiting polls, release on the third poll.
      return nth > 6 && ref === 'head-2' ? check(2, 'success') : null
    },
  })
  expect(snapshots).toEqual([3, 6, 9])
  // Three initial/fresh topology polls: 1 PR GET + 4 lists + 3 checks each.
  // A decisive poll intentionally adds extra validation calls.
  expect(result.calls.get).toBe(5)
  expect(result.calls.list).toBe(12)
  expect(result.calls.checks).toBe(10)
  expect(result.core.failures).toEqual([])
})

test('closing a successor makes a waiting middle PR a leaf', async () => {
  const stack = linearStack(5)
  const result = await run({
    pulls: stack,
    current: 4,
    checks: (ref, nth) => {
      if (nth === 3) stack[4].state = 'closed'
      return null
    },
  })
  expect(result.core.summaries.join('\n')).toContain(
    'no open PR is based on this head branch'
  )
})

test('closing or changing a predecessor rebuilds the chain on the next poll', async () => {
  const stack = linearStack(5)
  const result = await run({
    pulls: stack,
    current: 4,
    checks: (ref, nth) => {
      if (nth === 3) stack[1].state = 'closed'
      return null
    },
  })
  expect(result.core.summaries.join('\n')).toContain(
    'only 1 open predecessor PR(s) are reachable'
  )
})

test('a retargeted current PR opens on the next poll', async () => {
  const stack = linearStack(5)
  const result = await run({
    pulls: stack,
    current: 4,
    checks: (ref, nth) => {
      if (nth === 3) stack[3].base.ref = 'canary'
      return null
    },
  })
  expect(result.core.summaries.join('\n')).toContain(
    'only 0 open predecessor PR(s) are reachable'
  )
})

test('an outdated head/base cannot pass decisive revalidation', async () => {
  const stack = linearStack(5)
  const result = await run({
    pulls: stack,
    current: 4,
    checks: (ref, nth) => {
      if (nth === 2) stack[1].base.sha = 'changed-base'
      return ref === 'head-2'
        ? check(2, 'success', 'completed', {
            pull_requests: [
              {
                number: 2,
                head: { sha: 'head-2' },
                base: { ref: 'branch-1', sha: 'base-branch-1' },
              },
            ],
          })
        : null
    },
  })
  expect(result.core.summaries.join('\n')).toContain(
    'Five-hour waiting deadline reached'
  )
  expect(result.core.summaries.join('\n')).not.toContain('PR #2 passed')
})

test('a predecessor head update invalidates an apparent success', async () => {
  const stack = linearStack(5)
  const result = await run({
    pulls: stack,
    current: 4,
    checks: (ref, nth) => {
      if (nth === 3) stack[1].head.sha = 'rebased-head'
      return ref === 'head-2' ? check(2, 'success') : null
    },
  })
  expect(result.core.logs.join('\n')).toContain('changed during verification')
  expect(result.calls.refs).toContain('rebased-head')
  expect(result.core.summaries.join('\n')).toContain(
    'Five-hour waiting deadline reached'
  )
})

test('a failure rerun during decisive revalidation prevents false failure', async () => {
  const result = await run({
    pulls: linearStack(5),
    current: 4,
    checks: (ref, nth) =>
      ref === 'head-3' && nth >= 4
        ? check(30, 'success')
        : check(nth, 'failure'),
  })
  expect(result.core.failures).toEqual([])
  expect(result.core.logs.join('\n')).toContain('changed during verification')
  expect(result.core.summaries.join('\n')).toContain('PR #3 passed')
})

test('five-hour unresolved wait fails open and transient API errors retry', async () => {
  const pending = await run({ pulls: linearStack(5), current: 4 })
  expect(pending.core.summaries.join('\n')).toContain(
    'Five-hour waiting deadline reached'
  )
  let count = 0
  const temporary = Object.assign(new Error('temporarily unavailable'), {
    status: 500,
  })
  const recovered = await run({
    pulls: linearStack(5),
    current: 4,
    checks: { 'head-2': check(2, 'success') },
    getError: () => (count++ === 0 ? temporary : null),
  })
  expect(recovered.core.warnings.join('\n')).toContain(
    'Transient GitHub API error'
  )
  expect(recovered.core.summaries.join('\n')).toContain('PR #2 passed')
})

test('persistent 429 releases only at the five-hour deadline', async () => {
  const error = Object.assign(new Error('rate limited'), { status: 429 })
  const result = await run({
    pulls: linearStack(5),
    current: 4,
    getError: () => error,
  })
  expect(result.core.failures).toEqual([])
  expect(result.core.summaries.join('\n')).toContain(
    'Five-hour transient API error deadline reached'
  )
})

test('403 and ambiguous chain fail open', async () => {
  const unauthorized = await run({
    pulls: linearStack(5),
    current: 4,
    getError: () => Object.assign(new Error('not authorized'), { status: 403 }),
  })
  expect(unauthorized.core.warnings.join('\n')).toContain('failing open')
  const stack = linearStack(5)
  stack.push(pull(30, 'other', 'branch-3'))
  const ambiguous = await run({ pulls: stack, current: 4 })
  expect(ambiguous.core.summaries.join('\n')).toContain('multiple open PRs')
})

test('workflow keeps expensive work gated, forks isolated and action pinned to the CI SHA', () => {
  const workflow = fs.readFileSync(
    path.join(root, '.github/workflows/pr_stack_optimizer.yml'),
    'utf8'
  )
  const build = fs.readFileSync(
    path.join(root, '.github/workflows/build_and_test.yml'),
    'utf8'
  )
  const action = fs.readFileSync(path.join(__dirname, 'action.yml'), 'utf8')
  expect(workflow).toContain('runs-on: ubuntu-latest')
  expect(workflow).toContain('timeout-minutes: 360')
  expect(workflow).toContain('contents: read')
  expect(workflow).not.toContain('secrets:')
  expect(workflow).toContain('head.repo.full_name != github.repository')
  expect(
    workflow.match(/head.repo.full_name == github.repository/g)
  ).toHaveLength(2)
  expect(workflow).toContain('ref: ${{ github.sha }}')
  expect(workflow).toContain('persist-credentials: false')
  expect(workflow).toContain('.github/actions/pr-stack-ci-gate/action.yml')
  expect(workflow).toContain('.github/actions/pr-stack-ci-gate/dist/index.js')
  expect(workflow).toContain('uses: ./.github/actions/pr-stack-ci-gate')
  expect(action).toContain("using: 'node24'")
  expect(action).toContain("main: 'dist/index.js'")
  expect(build).toMatch(
    /optimize-ci:\n    permissions:\n      checks: read\n      contents: read\n      pull-requests: read/
  )
  for (const job of ['changes', 'build-next', 'validate-docs-links']) {
    const block = build.match(
      new RegExp(
        `^  ${job}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:|(?![\\s\\S]))`,
        'm'
      )
    )
    expect(block).not.toBeNull()
    expect(block[0]).toContain("needs: ['optimize-ci']")
  }
  const lint = build.match(
    /^  lint:\n([\s\S]*?)(?=^  validate-docs-links:)/m
  )?.[1]
  expect(lint).toBeDefined()
  const commands = [
    'pnpm lint-no-typescript',
    'pnpm check-examples',
    'pnpm validate-externals-doc',
    'pnpm generate-browser-variant-aliases',
    'pnpm --dir .github/actions/pr-stack-ci-gate install',
    'pnpm --dir .github/actions/pr-stack-ci-gate types',
    'pnpm --dir .github/actions/pr-stack-ci-gate build',
    'pnpm --dir .github/actions/pr-stack-ci-gate test',
    'git diff --exit-code',
  ]
  let previous = -1
  for (const command of commands) {
    const position = lint.indexOf(`        ${command}`)
    expect(position).toBeGreaterThan(previous)
    previous = position
  }
  expect(build).not.toContain('node --test .github/actions/pr-stack-ci-gate')
  expect(build).toContain("needs: ['optimize-ci', 'changes', 'build-next'")
})
