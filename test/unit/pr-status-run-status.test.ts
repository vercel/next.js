// scripts/pr-status.js decides from a workflow run's status and conclusion
// whether its report reads as clean, as still running, or as "CI did not pass".
import {
  describeUnpassedRun,
  generateIndexMd,
  isRunUnfinished,
} from '../../scripts/pr-status'

const noJobs = {
  failed: [],
  inProgress: [],
  queued: [],
  succeeded: [],
  cancelled: [],
  skipped: [],
}

function run(status: string, conclusion: string | null) {
  return {
    id: 1,
    run_attempt: 1,
    status,
    conclusion,
    created_at: '2026-11-13T00:00:00Z',
    updated_at: '2026-11-13T00:10:00Z',
    html_url: 'https://github.com/vercel/next.js/actions/runs/1',
  }
}

function indexMd(runMetadata: ReturnType<typeof run>, jobs = noJobs) {
  return generateIndexMd(
    { branchName: 'some-branch', prNumber: '1' },
    runMetadata,
    jobs,
    {},
    null,
    {}
  )
}

describe('pr-status run status', () => {
  it('treats every status other than completed as unfinished', () => {
    for (const status of [
      'queued',
      'in_progress',
      'waiting',
      'pending',
      'requested',
    ]) {
      expect(isRunUnfinished({ status })).toBe(true)
    }
    expect(isRunUnfinished({ status: 'completed' })).toBe(false)
  })

  it('reports a passing run with no failed jobs as clean', () => {
    const md = indexMd(run('completed', 'success'))
    expect(md.split('\n')[0]).toBe('# CI Failures Report')
    expect(md).not.toContain('CI did not pass')
    expect(describeUnpassedRun(run('completed', 'success'))).toBeNull()
  })

  it.each([
    ['action_required', 'waiting for a maintainer to approve'],
    ['cancelled', 'cancelled before any job failed'],
    ['startup_failure', 'failed to start'],
    ['skipped', 'was skipped'],
    ['stale', 'stale'],
    ['failure', 'without a failed job'],
  ])(
    'flags a completed %s run with no failed jobs as not passing',
    (conclusion, reason) => {
      const md = indexMd(run('completed', conclusion))
      expect(md.split('\n')[0]).toBe('# CI Status Report')
      expect(md).toContain('> **CI did not pass.**')
      expect(md).toContain(reason)
    }
  )

  it('names an unknown conclusion in the not-passing note', () => {
    const md = indexMd(run('completed', 'neutral'))
    expect(md).toContain('The run concluded "neutral" without any failed jobs.')
  })

  it('does not add the note to an unfinished run', () => {
    expect(describeUnpassedRun(run('in_progress', null))).toBeNull()
    expect(indexMd(run('queued', null))).not.toContain('CI did not pass')
  })

  it('lists failed jobs without the note when a cancelled run has some', () => {
    const md = indexMd(run('completed', 'cancelled'), {
      ...noJobs,
      failed: [{ id: 9, name: 'build', conclusion: 'failure' }],
    })
    expect(md).toContain('## Failed Jobs (1)')
    expect(md).not.toContain('CI did not pass')
  })
})
