// scripts/pr-status.js looks up a PR's CI run and downloads its job logs with
// the gh CLI. These tests pass a fake gh runner, so no gh is needed.
import {
  generateIndexMd,
  generateJobMd,
  getJobLogs,
  rawOutputFlagsFromHelp,
  stripAnsi,
  workflowRunsPath,
} from '../../scripts/pr-status'

const ESC = '\u001b'

function failedRun() {
  return {
    id: 1,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'failure',
    created_at: '2026-11-13T00:00:00Z',
    updated_at: '2026-11-13T00:10:00Z',
    html_url: 'https://github.com/vercel/next.js/actions/runs/1',
  }
}

function jobs(failed: object[]) {
  return {
    failed,
    inProgress: [],
    queued: [],
    succeeded: [],
    cancelled: [],
    skipped: [],
  }
}

describe('pr-status run lookup', () => {
  it('looks up runs by head commit when the PR is known', () => {
    // Two fork PRs can share a branch name, so the branch can't identify a PR.
    expect(workflowRunsPath({ branchName: 'fix/foo', headSha: 'abc123' })).toBe(
      'repos/vercel/next.js/actions/runs?head_sha=abc123&per_page=10'
    )
  })

  it('looks up runs by encoded branch name without a PR', () => {
    expect(workflowRunsPath({ branchName: 'fix/foo', headSha: null })).toBe(
      'repos/vercel/next.js/actions/runs?branch=fix%2Ffoo&per_page=10'
    )
  })
})

describe('pr-status job logs', () => {
  it('passes --allow-escape-sequences only when gh api --help lists it', () => {
    expect(
      rawOutputFlagsFromHelp(
        '--allow-escape-sequences   Allow printing terminal escape sequences'
      )
    ).toEqual(['--allow-escape-sequences'])
    expect(
      rawOutputFlagsFromHelp('--jq string   Query to select values')
    ).toEqual([])
  })

  it('downloads a log with the flag and strips its escape sequences', async () => {
    const calls: string[][] = []
    const result = await getJobLogs(42, {
      flags: ['--allow-escape-sequences'],
      runGh: async (prog: string, args: string[]) => {
        calls.push([prog, ...args])
        return `${ESC}[36;1mpnpm test${ESC}[0m\nError: No existing credentials found`
      },
    })
    expect(calls).toEqual([
      [
        'gh',
        'api',
        '--allow-escape-sequences',
        'repos/vercel/next.js/actions/jobs/42/logs',
      ],
    ])
    expect(result).toEqual({
      logs: 'pnpm test\nError: No existing credentials found',
      error: null,
    })
  })

  it('leaves the flag out for a gh that does not know it', async () => {
    const calls: string[][] = []
    await getJobLogs(42, {
      flags: [],
      runGh: async (prog: string, args: string[]) => {
        calls.push([prog, ...args])
        return ''
      },
    })
    expect(calls).toEqual([
      ['gh', 'api', 'repos/vercel/next.js/actions/jobs/42/logs'],
    ])
  })

  it("returns gh's error instead of a log when the download fails", async () => {
    const result = await getJobLogs(42, {
      flags: [],
      runGh: async () => {
        throw Object.assign(new Error('Command failed: gh api'), {
          stderr: '\ngh: Not Found (HTTP 404)\n',
        })
      },
    })
    expect(result).toEqual({ logs: '', error: 'gh: Not Found (HTTP 404)' })
  })

  it.each([
    ['colors', `${ESC}[36;1mrun${ESC}[0m`, 'run'],
    ['private-mode CSI', `a${ESC}[?25lb${ESC}[?25hc`, 'abc'],
    [
      'OSC 8 hyperlink',
      `${ESC}]8;;https://x.test${ESC}\\link${ESC}]8;;${ESC}\\`,
      'link',
    ],
    ['OSC ended by BEL', `${ESC}]0;title\u0007after`, 'after'],
    ['charset escape', `${ESC}(Bplain`, 'plain'],
    ['malformed CSI', `${ESC}[36\nnext`, '36\nnext'],
    ['lone ESC', `end${ESC}`, 'end'],
  ])('strips %s and leaves no ESC byte', (_name, input, expected) => {
    const output = stripAnsi(input)
    expect(output).toBe(expected)
    expect(output).not.toContain(ESC)
  })
})

describe('pr-status report when logs are missing', () => {
  const job = {
    id: 7,
    name: 'deploy (1/5)',
    conclusion: 'failure',
    started_at: '2026-11-13T00:00:00Z',
    completed_at: '2026-11-13T00:02:00Z',
    html_url: 'https://github.com/vercel/next.js/actions/runs/1/job/7',
    logError: 'gh: Not Found (HTTP 404)',
  }

  it('lists the failed download in index.md', () => {
    const md = generateIndexMd(
      { branchName: 'some-branch', prNumber: '1' },
      failedRun(),
      jobs([job]),
      {},
      null,
      {}
    )
    expect(md).toContain('| Logs unavailable |')
    expect(md).toContain('### Log Fetch Failures (1)')
    expect(md).toContain('- 7 (deploy (1/5)): gh: Not Found (HTTP 404)')
  })

  it('warns that the flaky-test list may be incomplete', () => {
    const md = generateIndexMd(
      { branchName: 'some-branch', prNumber: '1' },
      failedRun(),
      jobs([{ ...job, logError: null }]),
      {},
      null,
      {},
      { tests: new Set(), warning: 'Could not fetch logs for 2 of 5 jobs' }
    )
    expect(md).toContain('> **Warning:** Could not fetch logs for 2 of 5 jobs')
  })

  it("explains the missing sections in the job's file", () => {
    const md = generateJobMd(job, [], [], [], job.logError)
    expect(md).toContain('## Logs Unavailable')
    expect(md).toContain("Could not fetch this job's logs: gh: Not Found")
  })
})
