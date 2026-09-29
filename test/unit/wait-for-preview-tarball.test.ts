/* eslint-env jest */

import {
  createBuildAndDeployRunGetter,
  waitForPreviewTarball,
} from '../../scripts/wait-for-preview-tarball.mjs'

const missingTarball = async () => ({
  published: false,
  status: 404,
  lastResponse: 'not published yet',
  responseHeaders: null,
})

function createClock() {
  let currentTime = 0
  return {
    now: () => currentTime,
    sleep: async (milliseconds: number) => {
      currentTime += milliseconds
    },
  }
}

function producerRun(
  state: 'active' | 'success' | 'failure',
  overrides: Record<string, unknown> = {}
) {
  return {
    state,
    runId: 42,
    attempt: 1,
    conclusion: state === 'active' ? null : state,
    createdAt: 0,
    completedAt: state === 'active' ? null : 3_500,
    url: 'https://github.com/vercel/next.js/actions/runs/42',
    ...overrides,
  }
}

describe('waitForPreviewTarball', () => {
  it('keeps waiting when the matching producer crosses the ordinary deadline', async () => {
    const clock = createClock()

    await waitForPreviewTarball({
      commitSha: 'abc',
      timeoutMs: 3_000,
      pollIntervalMs: 100,
      producerPollIntervalMs: 100,
      producerTimeoutMs: 10_000,
      uploadGraceMs: 1_000,
      now: clock.now,
      sleep: clock.sleep,
      getProducerRun: async () =>
        clock.now() < 3_500 ? producerRun('active') : producerRun('success'),
      probe: async () =>
        clock.now() >= 3_700
          ? {
              published: true,
              status: 200,
              lastResponse: '200',
              responseHeaders: null,
            }
          : missingTarball(),
    })

    expect(clock.now()).toBe(3_700)
  })

  it('bounds the upload grace after a successful producer', async () => {
    const clock = createClock()

    await expect(
      waitForPreviewTarball({
        commitSha: 'abc',
        timeoutMs: 3_000,
        pollIntervalMs: 100,
        producerPollIntervalMs: 100,
        uploadGraceMs: 1_000,
        now: clock.now,
        sleep: clock.sleep,
        getProducerRun: async () => producerRun('success'),
        probe: missingTarball,
      })
    ).rejects.toThrow('within 1s after build-and-deploy run')
  })

  it('reports a terminal producer failure at the ordinary deadline', async () => {
    const clock = createClock()

    await expect(
      waitForPreviewTarball({
        commitSha: 'abc',
        timeoutMs: 3_000,
        pollIntervalMs: 100,
        producerPollIntervalMs: 100,
        producerRetryGraceMs: 500,
        now: clock.now,
        sleep: clock.sleep,
        getProducerRun: async () =>
          producerRun('failure', { conclusion: 'cancelled', attempt: 2 }),
        probe: missingTarball,
      })
    ).rejects.toThrow('attempt 2 finished with cancelled and no retry started')
  })

  it('bounds an indefinitely active producer', async () => {
    const clock = createClock()

    await expect(
      waitForPreviewTarball({
        commitSha: 'abc',
        timeoutMs: 3_000,
        pollIntervalMs: 100,
        producerPollIntervalMs: 100,
        producerTimeoutMs: 4_000,
        now: clock.now,
        sleep: clock.sleep,
        getProducerRun: async () => producerRun('active'),
        probe: missingTarball,
      })
    ).rejects.toThrow('did not finish within 4s')
  })

  it('follows a newer active retry instead of an earlier failure', async () => {
    const clock = createClock()

    await waitForPreviewTarball({
      commitSha: 'abc',
      timeoutMs: 3_000,
      pollIntervalMs: 100,
      producerPollIntervalMs: 100,
      producerTimeoutMs: 10_000,
      now: clock.now,
      sleep: clock.sleep,
      getProducerRun: async () =>
        clock.now() < 3_100
          ? producerRun('failure')
          : producerRun('active', { attempt: 2 }),
      probe: async () =>
        clock.now() >= 3_500
          ? {
              published: true,
              status: 200,
              lastResponse: '200',
              responseHeaders: null,
            }
          : missingTarball(),
    })

    expect(clock.now()).toBe(3_500)
  })
})

describe('createBuildAndDeployRunGetter', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_REPOSITORY: 'vercel/next.js',
      GITHUB_TOKEN: 'test-token',
      GITHUB_EVENT_NAME: 'push',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it('selects an active retry over an earlier failed run for the commit', async () => {
    global.fetch = jest.fn(async () =>
      Response.json({
        workflow_runs: [
          {
            id: 1,
            head_sha: 'abc',
            status: 'completed',
            conclusion: 'failure',
            run_attempt: 1,
            created_at: '2026-09-08T20:00:00Z',
            updated_at: '2026-09-08T20:20:00Z',
            html_url: 'https://github.test/run/1',
          },
          {
            id: 2,
            head_sha: 'abc',
            status: 'in_progress',
            conclusion: null,
            run_attempt: 2,
            created_at: '2026-09-08T20:21:00Z',
            updated_at: '2026-09-08T20:22:00Z',
            html_url: 'https://github.test/run/2',
          },
        ],
      })
    ) as typeof fetch

    await expect(
      createBuildAndDeployRunGetter('abc')?.()
    ).resolves.toMatchObject({ state: 'active', runId: 2, attempt: 2 })
  })

  it('matches a pull-request producer by its head commit', async () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request'
    global.fetch = jest.fn(async () =>
      Response.json({
        workflow_runs: [
          {
            id: 3,
            head_sha: 'merge-sha',
            pull_requests: [{ head: { sha: 'abc' } }],
            status: 'completed',
            conclusion: 'success',
            run_attempt: 1,
            created_at: '2026-09-08T20:00:00Z',
            updated_at: '2026-09-08T20:30:00Z',
            html_url: 'https://github.test/run/3',
          },
        ],
      })
    ) as typeof fetch

    await expect(
      createBuildAndDeployRunGetter('abc', 'feature-branch')?.()
    ).resolves.toMatchObject({ state: 'success', runId: 3 })
    const requestUrl = (global.fetch as jest.Mock).mock.calls[0][0] as URL
    expect(requestUrl.searchParams.get('branch')).toBe('feature-branch')
    expect(requestUrl.searchParams.get('event')).toBe('pull_request')
  })
})
