import type * as coreModule from '@actions/core'
import type { context as githubContext, getOctokit } from '@actions/github'

type Github = ReturnType<typeof getOctokit>
type Context = typeof githubContext
type Core = Pick<
  typeof coreModule,
  'setOutput' | 'setFailed' | 'warning' | 'info' | 'summary'
>
type Pull = {
  number: number
  state: string
  base: { ref: string; sha: string }
  head: { ref: string; sha: string; repo: { full_name: string } | null }
  labels: { name: string }[]
}
type Check = {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string | null
  head_sha: string
  app: { slug: string } | null
  pull_requests?: {
    number: number
    head?: { sha?: string }
    base?: { ref?: string; sha?: string }
  }[]
}
type Role =
  | 'fork'
  | 'bypass'
  | 'top'
  | 'ambiguous'
  | 'first-three'
  | 'middle'
  | 'non-pr'
  | 'error'
type CandidateState = 'success' | 'waiting' | 'unsuccessful'
type Candidate = { pull: Pull; check: Check | null; state: CandidateState }
type Topology = {
  current: Pull
  role: Role
  reason?: string
  predecessors?: Pull[]
}
type Snapshot = {
  current?: Pull | null
  role: Role
  reason?: string
  candidates?: Candidate[]
}

const POLL_INTERVAL_MS = 5 * 60 * 1000
const WAIT_DEADLINE_MS = 5 * 60 * 60 * 1000
const REQUIRED_CHECK = 'thank you, next'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const data = error as { status?: number; response?: { status?: number } }
  return data.status ?? data.response?.status
}

function isTransientApiError(error: unknown): boolean {
  const status = errorStatus(error)
  return (
    status === 429 || (status !== undefined && status >= 500 && status < 600)
  )
}

function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
}

function checkState(check: Check | null): CandidateState {
  if (!check || check.status !== 'completed') return 'waiting'
  return check.conclusion === 'success' ? 'success' : 'unsuccessful'
}

// Any nearby green CI can release this PR despite a flaky predecessor, but
// all three must have finished unsuccessfully before the gate can fail.
function gateDecision(candidates: Candidate[]): 'open' | 'fail' | 'wait' {
  if (candidates.some((candidate) => candidate.state === 'success')) {
    return 'open'
  }
  if (
    candidates.length === 3 &&
    candidates.every((candidate) => candidate.state === 'unsuccessful')
  ) {
    return 'fail'
  }
  return 'wait'
}

function sameRepository(pull: Pull, repository: string): boolean {
  return pull.head?.repo?.full_name === repository
}

function sameRevision(before: Pull, after: Pull): boolean {
  return (
    after.state === 'open' &&
    before.head.sha === after.head.sha &&
    before.base.ref === after.base.ref &&
    before.base.sha === after.base.sha
  )
}

export async function runGate({
  github,
  context,
  core,
}: {
  github: Github
  context: Context
  core: Core
}): Promise<void> {
  // A failed gate stops expensive dependents via its job conclusion; all
  // successful gate outcomes retain the reusable workflow's skip=false API.
  core.setOutput('skip', 'false')

  const startedAt = Date.now()
  let lastFingerprint = ''
  const { owner, repo } = context.repo
  const repository = context.payload.repository?.full_name ?? ''

  async function listOpenPulls(
    parameters: Record<string, string>
  ): Promise<Pull[]> {
    const pulls = await github.paginate(github.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: 100,
      ...parameters,
    })
    return pulls as unknown as Pull[]
  }

  async function getPull(number: number): Promise<Pull> {
    const { data } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    })
    return data as unknown as Pull
  }

  async function findPredecessor(pull: Pull): Promise<{
    ambiguous: boolean
    pull?: Pull
  }> {
    const matches = (
      await listOpenPulls({ head: `${owner}:${pull.base.ref}` })
    ).filter(
      (candidate) =>
        candidate.number !== pull.number &&
        candidate.head.ref === pull.base.ref &&
        sameRepository(candidate, repository)
    )
    return { ambiguous: matches.length > 1, pull: matches[0] }
  }

  async function findSuccessors(pull: Pull): Promise<Pull[]> {
    return (await listOpenPulls({ base: pull.head.ref })).filter(
      (candidate) =>
        candidate.number !== pull.number &&
        candidate.base.ref === pull.head.ref &&
        sameRepository(candidate, repository)
    )
  }

  // Base/head branch links also describe stacks not registered in GitHub's
  // stack API. A leaf runs immediately so the top PR is never held by polling.
  async function discoverTopology(): Promise<Topology> {
    const prNumber = context.payload.pull_request?.number
    if (!prNumber) throw new Error('Missing pull request number')
    const current = await getPull(prNumber)

    if (!sameRepository(current, repository)) {
      return {
        current,
        role: 'fork',
        reason: 'fork PRs always run immediately',
      }
    }
    if (
      current.labels.some((label) => label.name === process.env.BYPASS_LABEL)
    ) {
      return { current, role: 'bypass', reason: 'bypass label is present' }
    }

    if ((await findSuccessors(current)).length === 0) {
      return {
        current,
        role: 'top',
        reason: 'no open PR is based on this head branch',
      }
    }

    const predecessors: Pull[] = []
    const seen = new Set([current.number])
    let cursor = current
    while (predecessors.length < 3) {
      const result = await findPredecessor(cursor)
      if (result.ambiguous) {
        return {
          current,
          role: 'ambiguous',
          reason: `multiple open PRs have head branch ${cursor.base.ref}`,
        }
      }
      if (!result.pull) break
      if (seen.has(result.pull.number)) {
        return {
          current,
          role: 'ambiguous',
          reason: 'cycle detected in PR base branches',
        }
      }
      seen.add(result.pull.number)
      predecessors.push(result.pull)
      cursor = result.pull
    }
    if (predecessors.length < 3) {
      return {
        current,
        role: 'first-three',
        reason: `only ${predecessors.length} open predecessor PR(s) are reachable`,
      }
    }
    return { current, role: 'middle', predecessors }
  }

  // The required check may attach to the PR head rather than its test-merge
  // SHA. Match the current PR and base too, rejecting a green check from a
  // previous rebase before it can release downstream CI.
  async function latestRequiredCheck(pull: Pull): Promise<Candidate> {
    const { data } = await github.rest.checks.listForRef({
      owner,
      repo,
      ref: pull.head.sha,
      check_name: REQUIRED_CHECK,
      filter: 'latest',
      per_page: 100,
    })
    const check = (data.check_runs as unknown as Check[])
      .filter(
        (candidate) =>
          candidate.name === REQUIRED_CHECK &&
          candidate.app?.slug === 'github-actions' &&
          candidate.head_sha === pull.head.sha &&
          candidate.pull_requests?.some(
            (associated) =>
              associated.number === pull.number &&
              associated.head?.sha === pull.head.sha &&
              associated.base?.ref === pull.base.ref &&
              associated.base?.sha === pull.base.sha
          )
      )
      .sort((a, b) => b.id - a.id)[0]
    return { pull, check: check ?? null, state: checkState(check ?? null) }
  }

  // pulls.list already includes head/base metadata. Fetching each PR again
  // during *every* pending poll wastes three REST requests (11 -> 8). Before
  // any decisive open/fail, validate live PR revisions and re-read their checks
  // so a rebase, retarget, closure or rerun cannot reuse a stale result.
  async function stillDecisive(
    topology: Topology,
    candidates: Candidate[],
    decision: 'open' | 'fail'
  ): Promise<boolean> {
    const freshCurrent = await getPull(topology.current.number)
    if (!sameRevision(topology.current, freshCurrent)) return false

    const relevant =
      decision === 'open'
        ? [candidates.find((candidate) => candidate.state === 'success')!]
        : candidates
    for (const candidate of relevant) {
      const fresh = await getPull(candidate.pull.number)
      if (!sameRevision(candidate.pull, fresh)) return false
      const latest = await latestRequiredCheck(fresh)
      if (
        latest.state !== candidate.state ||
        latest.check?.id !== candidate.check?.id
      ) {
        return false
      }
    }
    return true
  }

  function fingerprint(snapshot: Snapshot): string {
    return JSON.stringify({
      role: snapshot.role,
      reason: snapshot.reason,
      candidates: snapshot.candidates?.map((candidate) => ({
        number: candidate.pull.number,
        head: candidate.pull.head.sha,
        base: candidate.pull.base.sha,
        status: candidate.check?.status,
        conclusion: candidate.check?.conclusion,
      })),
    })
  }

  async function writeSummary(
    snapshot: Snapshot,
    outcome: 'open' | 'failed',
    reason: string
  ): Promise<void> {
    try {
      const current = snapshot.current
      const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60000)
      const lines = [
        '# PR Stack CI Gate',
        '',
        `- PR: #${current?.number ?? context.payload.pull_request?.number ?? 'n/a'}`,
        `- Branches: \`${escapeCell(current?.base?.ref)}\` ← \`${escapeCell(current?.head?.ref)}\``,
        `- Role: **${escapeCell(snapshot.role)}**`,
        `- Result: **${escapeCell(outcome)}**`,
        `- Reason: ${escapeCell(reason)}`,
        `- Elapsed: ${elapsedMinutes} minute(s)`,
      ]
      if (snapshot.candidates?.length) {
        lines.push(
          '',
          '| PR | Base ← Head | Head SHA | Base SHA | Check | State |',
          '|---:|---|---|---|---|---|'
        )
        for (const candidate of snapshot.candidates) {
          const checkText = candidate.check
            ? `[${candidate.check.status}/${candidate.check.conclusion ?? ''}](${candidate.check.html_url})`
            : 'not reported'
          lines.push(
            `| #${candidate.pull.number} | \`${escapeCell(candidate.pull.base.ref)}\` ← \`${escapeCell(candidate.pull.head.ref)}\` | \`${escapeCell(candidate.pull.head.sha?.slice(0, 12))}\` | \`${escapeCell(candidate.pull.base.sha?.slice(0, 12))}\` | ${checkText} | ${candidate.state} |`
          )
        }
      }
      await core.summary.addRaw(`${lines.join('\n')}\n`).write()
    } catch (error) {
      core.warning(
        `Could not write PR Stack CI Gate summary: ${errorMessage(error)}`
      )
    }
  }

  try {
    if (context.eventName !== 'pull_request') {
      const reason = `${context.eventName} runs immediately`
      await writeSummary({ role: 'non-pr', reason }, 'open', reason)
      return
    }

    while (true) {
      let topology: Topology
      const candidates: Candidate[] = []
      try {
        topology = await discoverTopology()
        if (topology.role === 'middle') {
          // Always check all three, even if the nearest is pending: a more
          // distant PR can have succeeded. A failed PR may also pass on rerun.
          for (const predecessor of topology.predecessors!) {
            candidates.push(await latestRequiredCheck(predecessor))
          }
          const decision = gateDecision(candidates)
          if (
            decision !== 'wait' &&
            !(await stillDecisive(topology, candidates, decision))
          ) {
            core.info('Stack/check state changed during verification; retrying')
            await new Promise((resolve) =>
              setTimeout(resolve, POLL_INTERVAL_MS)
            )
            continue
          }
        }
      } catch (error) {
        // A brief GitHub outage should not start all waiting CI at once;
        // retry transient errors until the same five-hour waiting deadline.
        if (!isTransientApiError(error)) throw error
        if (Date.now() - startedAt >= WAIT_DEADLINE_MS) {
          await writeSummary(
            {
              current: context.payload.pull_request as unknown as Pull,
              role: 'error',
              reason: errorMessage(error),
            },
            'open',
            'Five-hour transient API error deadline reached; starting full CI'
          )
          return
        }
        core.warning(
          `Transient GitHub API error (${errorStatus(error)}); retrying in five minutes: ${errorMessage(error)}`
        )
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        continue
      }

      if (topology.role !== 'middle') {
        await writeSummary(topology, 'open', topology.reason ?? '')
        return
      }
      const snapshot: Snapshot = { ...topology, candidates }
      const decision = gateDecision(candidates)
      const currentFingerprint = fingerprint(snapshot)
      if (currentFingerprint !== lastFingerprint) {
        core.info(
          `PR #${topology.current.number}: ${candidates
            .map((candidate) => `#${candidate.pull.number}=${candidate.state}`)
            .join(', ')}`
        )
        lastFingerprint = currentFingerprint
      }

      if (decision === 'open') {
        const successful = candidates.find(
          (candidate) => candidate.state === 'success'
        )!
        await writeSummary(
          snapshot,
          'open',
          `PR #${successful.pull.number} passed ${REQUIRED_CHECK}`
        )
        return
      }
      if (decision === 'fail') {
        const reason = `All three predecessor PRs completed ${REQUIRED_CHECK} without success. Rerun this workflow after a predecessor passes, or apply the ${process.env.BYPASS_LABEL} label.`
        await writeSummary(snapshot, 'failed', reason)
        core.setFailed(reason)
        return
      }
      if (Date.now() - startedAt >= WAIT_DEADLINE_MS) {
        await writeSummary(
          snapshot,
          'open',
          'Five-hour waiting deadline reached; failing open and starting full CI'
        )
        return
      }
      const nextPoll = new Date(Date.now() + POLL_INTERVAL_MS)
      core.info(
        `No predecessor has passed yet; polling again at ${nextPoll.toISOString()}`
      )
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  } catch (error) {
    // Unexpected errors must run the required full-CI graph, not turn a
    // missing classification result into a mergeable skipped-check success.
    core.warning(
      `PR stack classification failed; failing open and starting full CI: ${String(error)}`
    )
    await writeSummary(
      {
        current: context.payload.pull_request as unknown as Pull | undefined,
        role: 'error',
        reason: errorMessage(error),
      },
      'open',
      `Classification/API error; failing open: ${errorMessage(error)}`
    )
  }
}
