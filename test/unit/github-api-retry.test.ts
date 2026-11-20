// Retry and backoff for the GitHub API calls made by CI scripts:
// scripts/github-utils/retry.js and its callers, scripts/github-utils/signed-commit.js
// and scripts/pr-ci-comment.mjs. Fetch and sleep are stubbed, so no network is
// used and no real backoff time passes.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DEFAULT_MAX_ATTEMPTS,
  fetchWithRetry,
  getRetryMetadata,
} from '../../scripts/github-utils/retry'
import {
  BLOB_UPLOAD_CONCURRENCY,
  createTreeFromLocalCommit,
  githubRequest,
} from '../../scripts/github-utils/signed-commit'

type Spec = { status: number; headers?: Record<string, string>; body?: string }

function stubFetch(specs: Spec[]) {
  let index = 0
  const fetch = jest.fn(async () => {
    const spec = specs[Math.min(index++, specs.length - 1)]
    return new Response(spec.status === 204 ? null : (spec.body ?? '{}'), {
      status: spec.status,
      headers: spec.headers,
    })
  })
  return fetch
}

function retryOptions(fetch: jest.Mock<Promise<Response>, []>, extra = {}) {
  const sleep = jest.fn(async (_ms: number) => {})
  const log = jest.fn()
  return {
    sleep,
    log,
    options: {
      description: 'GET /test',
      fetch,
      sleep,
      log,
      random: () => 0.5,
      ...extra,
    },
  }
}

describe('fetchWithRetry', () => {
  it('retries a 502 and returns the successful response', async () => {
    const fetch = stubFetch([{ status: 502 }, { status: 200 }])
    const { options, sleep, log } = retryOptions(fetch)

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('GET /test failed with 502 (attempt 1/4)')
    )
    expect(getRetryMetadata(res)).toEqual({ attempts: 2, transient: false })
  })

  it('retries a 429 with growing, jittered backoff', async () => {
    const fetch = stubFetch([
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 200 },
    ])
    const { options, sleep } = retryOptions(fetch)

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(4)
    // Base 2s doubling per attempt; with random() = 0.5 the equal jitter
    // lands at 75% of each step.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1500, 3000, 6000])
  })

  it('honours Retry-After', async () => {
    const fetch = stubFetch([
      { status: 429, headers: { 'retry-after': '7' } },
      { status: 200 },
    ])
    const { options, sleep } = retryOptions(fetch)

    await fetchWithRetry('https://api.test', {}, options)

    expect(sleep).toHaveBeenCalledWith(7000)
  })

  it('honours Retry-After as an HTTP date', async () => {
    const fetch = stubFetch([
      {
        status: 429,
        headers: { 'retry-after': new Date(Date.now() + 10_000).toUTCString() },
      },
      { status: 200 },
    ])
    const { options, sleep } = retryOptions(fetch)

    await fetchWithRetry('https://api.test', {}, options)

    const [[ms]] = sleep.mock.calls
    expect(ms).toBeGreaterThan(5_000)
    expect(ms).toBeLessThanOrEqual(10_000)
  })

  it('honours Retry-After on a 503', async () => {
    const fetch = stubFetch([
      { status: 503, headers: { 'retry-after': '5' } },
      { status: 200 },
    ])
    const { options, sleep } = retryOptions(fetch)

    await fetchWithRetry('https://api.test', {}, options)

    expect(sleep).toHaveBeenCalledWith(5000)
  })

  it('does not retry a rejected fetch', async () => {
    const fetch = jest.fn(async (): Promise<Response> => {
      throw new TypeError('fetch failed')
    })
    const { options, sleep } = retryOptions(fetch)

    await expect(
      fetchWithRetry('https://api.test', {}, options)
    ).rejects.toThrow('fetch failed')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('waits for x-ratelimit-reset when the rate limit is exhausted', async () => {
    const reset = Math.floor(Date.now() / 1000) + 30
    const fetch = stubFetch([
      {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        },
      },
      { status: 200 },
    ])
    const { options, sleep } = retryOptions(fetch)

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(200)
    const [[ms]] = sleep.mock.calls
    expect(ms).toBeGreaterThan(25_000)
    expect(ms).toBeLessThanOrEqual(30_000)
  })

  it('gives up without waiting when the requested wait exceeds the cap', async () => {
    const fetch = stubFetch([
      { status: 429, headers: { 'retry-after': '600' } },
      { status: 200 },
    ])
    const { options, sleep, log } = retryOptions(fetch, {
      maxRetryWaitMs: 120_000,
    })

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(429)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('600s'))
    expect(getRetryMetadata(res)).toEqual({ attempts: 1, transient: true })
  })

  it.each([400, 401, 404, 422])('does not retry a %i', async (status) => {
    const fetch = stubFetch([{ status }, { status: 200 }])
    const { options, sleep } = retryOptions(fetch)

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(status)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
    expect(getRetryMetadata(res)).toEqual({ attempts: 1, transient: false })
  })

  it('does not retry a 403 without a rate limit signal', async () => {
    const fetch = stubFetch([
      { status: 403, body: '{"message":"Resource not accessible"}' },
      { status: 200 },
    ])
    const { options } = retryOptions(fetch)

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(403)
    expect(fetch).toHaveBeenCalledTimes(1)
    // The body is still readable by the caller.
    expect(await res.text()).toContain('Resource not accessible')
  })

  it('retries a 403 secondary rate limit identified by its message', async () => {
    const fetch = stubFetch([
      {
        status: 403,
        body: '{"message":"You have exceeded a secondary rate limit."}',
      },
      { status: 201 },
    ])
    const { options } = retryOptions(fetch)

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(201)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after the maximum number of attempts', async () => {
    const fetch = stubFetch([{ status: 503 }])
    const { options, sleep, log } = retryOptions(fetch)

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(DEFAULT_MAX_ATTEMPTS).toBe(4)
    expect(res.status).toBe(503)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(sleep).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenLastCalledWith(
      expect.stringContaining('giving up after 4 attempts')
    )
    expect(getRetryMetadata(res)).toEqual({ attempts: 4, transient: true })
  })

  it('with retryServerErrors: false, does not repeat a request that got a 502', async () => {
    const fetch = stubFetch([{ status: 502 }, { status: 201 }])
    const { options, sleep } = retryOptions(fetch, {
      retryServerErrors: false,
    })

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(502)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
    expect(getRetryMetadata(res)).toEqual({ attempts: 1, transient: true })
  })

  it('with retryServerErrors: false, still retries a 429', async () => {
    const fetch = stubFetch([{ status: 429 }, { status: 201 }])
    const { options } = retryOptions(fetch, { retryServerErrors: false })

    const res = await fetchWithRetry('https://api.test', {}, options)

    expect(res.status).toBe(201)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('signed-commit githubRequest', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('retries a 429 blob upload', async () => {
    const fetch = stubFetch([
      { status: 429, headers: { 'retry-after': '1' } },
      { status: 201, body: '{"sha":"abc"}' },
    ])
    globalThis.fetch = fetch
    const sleep = jest.fn(async () => {})

    const blob = await githubRequest(
      'token',
      'POST',
      '/repos/o/r/git/blobs',
      { content: '', encoding: 'base64' },
      { sleep, log: () => {} }
    )

    expect(blob).toEqual({ sha: 'abc' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('reports the status and attempt count after giving up', async () => {
    globalThis.fetch = stubFetch([{ status: 502, body: 'Server Error' }])

    await expect(
      githubRequest(
        'token',
        'POST',
        '/repos/o/r/git/blobs',
        {},
        {
          sleep: async () => {},
          log: () => {},
        }
      )
    ).rejects.toThrow(
      'GitHub API POST /repos/o/r/git/blobs failed (502) after 4 attempts: Server Error'
    )
  })

  it('does not retry a 404', async () => {
    const fetch = stubFetch([{ status: 404, body: 'Not Found' }])
    globalThis.fetch = fetch

    await expect(
      githubRequest('token', 'GET', '/repos/o/r', undefined, {
        sleep: async () => {},
        log: () => {},
      })
    ).rejects.toThrow('GitHub API GET /repos/o/r failed (404): Not Found')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a release POST after a 502', async () => {
    const fetch = stubFetch([{ status: 502, body: 'Server Error' }])
    globalThis.fetch = fetch

    await expect(
      githubRequest(
        'token',
        'POST',
        '/repos/o/r/releases',
        {},
        {
          sleep: async () => {},
          log: () => {},
        }
      )
    ).rejects.toThrow('GitHub API POST /repos/o/r/releases failed (502)')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries a release POST that was rate limited', async () => {
    const fetch = stubFetch([
      { status: 429 },
      { status: 201, body: '{"id":1}' },
    ])
    globalThis.fetch = fetch

    await githubRequest(
      'token',
      'POST',
      '/repos/o/r/releases',
      {},
      {
        sleep: async () => {},
        log: () => {},
      }
    )
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('signed-commit createTreeFromLocalCommit', () => {
  const originalCwd = process.cwd()
  let repoDir: string

  beforeAll(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-commit-'))
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' })
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    git('commit', '-q', '--allow-empty', '-m', 'base')
    for (let i = 0; i < 21; i++) {
      fs.writeFileSync(path.join(repoDir, `file-${i}.txt`), `content ${i}\n`)
    }
    git('add', '.')
    git('commit', '-q', '-m', 'change')
    process.chdir(repoDir)
  })

  afterAll(() => {
    process.chdir(originalCwd)
    fs.rmSync(repoDir, { recursive: true, force: true })
  })

  it('caps concurrent blob uploads and keeps the tree order', async () => {
    const totalBlobs = 21
    let started = 0
    let inFlight = 0
    let maxInFlight = 0
    let blobCount = 0
    let waiting: Array<() => void> = []
    let treeBody: { tree: Array<{ path: string }> } | undefined
    const request = jest.fn(async (_token, _method, route: string, body) => {
      if (route.endsWith('/git/trees')) {
        treeBody = body
        return { sha: 'tree-sha' }
      }
      const index = started++
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      // Hold uploads until a full pool has arrived (or the last one has), so
      // the peak does not depend on how fast `git` runs.
      await new Promise<void>((resolve) => {
        waiting.push(resolve)
        if (
          waiting.length >= BLOB_UPLOAD_CONCURRENCY ||
          started === totalBlobs
        ) {
          const release = waiting
          waiting = []
          release.forEach((fn) => fn())
        }
      })
      // Finish out of order, so the tree order cannot come from completion order.
      await new Promise((resolve) => setTimeout(resolve, totalBlobs - index))
      const sha = `blob-${blobCount++}`
      inFlight--
      return { sha }
    })

    const treeSha = await createTreeFromLocalCommit({
      token: 'token',
      repoApiPath: '/repos/o/r',
      diffBaseSha: 'HEAD~1',
      baseTreeSha: 'base-tree',
      localCommitSha: 'HEAD',
      request,
    })

    expect(treeSha).toBe('tree-sha')
    expect(BLOB_UPLOAD_CONCURRENCY).toBe(4)
    expect(maxInFlight).toBe(BLOB_UPLOAD_CONCURRENCY)
    const changed = execFileSync(
      'git',
      ['diff-tree', '-r', '--name-only', '--no-renames', 'HEAD~1', 'HEAD'],
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
    expect(treeBody?.tree.map((entry) => entry.path)).toEqual(changed)
    expect(treeBody?.tree).toHaveLength(21)
  })
})

describe('pr-ci-comment.mjs', () => {
  const repoRoot = path.join(__dirname, '../..')
  const stub = path.join(__dirname, 'fixtures/github-api-retry/fetch-stub.mjs')
  let tmpDir: string
  const botComment = {
    id: 42,
    user: { login: 'github-actions[bot]' },
    body: '<!-- __NEXT_TEST_REPORT_COMMENT__ -->',
    html_url: 'https://x/c/42',
  }

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-ci-comment-'))
  })
  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function run(conclusion: string, routes: object[]) {
    const eventPath = path.join(tmpDir, `event-${conclusion}.json`)
    fs.writeFileSync(
      eventPath,
      JSON.stringify({
        action: 'completed',
        repository: { full_name: 'vercel/next.js' },
        workflow_run: {
          id: 1001,
          run_attempt: 2,
          name: 'build-and-test',
          event: 'pull_request',
          conclusion,
          head_branch: 'feature',
          head_sha: 'a'.repeat(40),
          head_repository: {
            full_name: 'vercel/next.js',
            owner: { login: 'vercel' },
          },
          html_url: 'https://github.com/vercel/next.js/actions/runs/1001',
        },
      })
    )

    const pulls = {
      match: '/pulls?',
      responses: [
        {
          status: 200,
          body: [
            {
              number: 1,
              state: 'open',
              head: {
                ref: 'feature',
                sha: 'a'.repeat(40),
                repo: { full_name: 'vercel/next.js' },
              },
            },
          ],
        },
      ],
    }

    const result = spawnSync(
      process.execPath,
      // `--import` takes a URL, and an absolute Windows path is not one.
      ['--import', pathToFileURL(stub).href, 'scripts/pr-ci-comment.mjs'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          NODE_ENV: 'test',
          PATH: process.env.PATH,
          // Windows processes need these to start reliably.
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          GITHUB_TOKEN: 'test-token',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_API_URL: 'https://api.github.test',
          FETCH_STUB_ROUTES: JSON.stringify([pulls, ...routes]),
        },
      }
    )
    return { ...result, output: result.stdout + result.stderr }
  }

  it('exits 0 with a warning when listing jobs keeps failing with 502', () => {
    const { status, output } = run('failure', [
      { match: '/jobs?', responses: [{ status: 502, body: 'Server Error' }] },
    ])

    expect(output).toMatch(/failed with 502 \(attempt 1\/4\); retrying in/)
    expect(output).toMatch(/failed with 502 \(attempt 3\/4\); retrying in/)
    expect(output).toContain('giving up after 4 attempts')
    expect(output.match(/\[fetch-stub\] GET \S+\/jobs\?/g)).toHaveLength(4)
    expect(output).toMatch(/^::warning .*failed with 502 after 4 attempts/m)
    expect(output).not.toMatch(/^\s+at /m)
    expect(status).toBe(0)
  })

  it('posts the comment after a transient 502 on the jobs listing', () => {
    const { status, output } = run('failure', [
      {
        match: '/jobs?',
        responses: [{ status: 502 }, { status: 200, body: { jobs: [] } }],
      },
      { match: '/comments?', responses: [{ status: 200, body: [] }] },
      {
        method: 'POST',
        match: '/issues/1/comments',
        responses: [{ status: 201, body: { html_url: 'https://x/c/1' } }],
      },
    ])

    expect(output).toContain('Created comment https://x/c/1')
    expect(status).toBe(0)
  })

  it('does not repeat the comment POST after a 502', () => {
    const { status, output } = run('success', [
      { match: '/comments?', responses: [{ status: 200, body: [] }] },
      {
        method: 'POST',
        match: '/issues/1/comments',
        responses: [{ status: 502 }, { status: 201, body: {} }],
      },
    ])

    expect(output.match(/\[fetch-stub\] POST /g)).toHaveLength(1)
    expect(output).toMatch(/^::warning /m)
    expect(status).toBe(0)
  })

  it('retries the comment POST when it was rate limited', () => {
    const { status, output } = run('success', [
      { match: '/comments?', responses: [{ status: 200, body: [] }] },
      {
        method: 'POST',
        match: '/issues/1/comments',
        responses: [
          { status: 429, headers: { 'retry-after': '1' } },
          { status: 201, body: { html_url: 'https://x/c/2' } },
        ],
      },
    ])

    expect(output.match(/\[fetch-stub\] POST /g)).toHaveLength(2)
    expect(output).toContain('Created comment https://x/c/2')
    expect(status).toBe(0)
  })

  it('exits 0 with a warning when GitHub asks to wait longer than the cap', () => {
    const { status, output } = run('failure', [
      {
        match: '/jobs?',
        responses: [{ status: 429, headers: { 'retry-after': '3600' } }],
      },
    ])

    expect(output.match(/\[fetch-stub\] GET \S+\/jobs\?/g)).toHaveLength(1)
    expect(output).toContain('GitHub asked to wait 3600s')
    expect(output).toMatch(/^::warning /m)
    expect(status).toBe(0)
  })

  it('does not create a second comment when updating the existing one keeps failing', () => {
    const { status, output } = run('success', [
      { match: '/comments?', responses: [{ status: 200, body: [botComment] }] },
      {
        method: 'PATCH',
        match: '/issues/comments/42',
        responses: [{ status: 502 }],
      },
    ])

    expect(output.match(/\[fetch-stub\] PATCH /g)).toHaveLength(4)
    expect(output).not.toMatch(/\[fetch-stub\] POST /)
    expect(output).toMatch(/^::warning /m)
    expect(status).toBe(0)
  })

  it('creates a new comment when the existing one cannot be updated', () => {
    const { status, output } = run('success', [
      { match: '/comments?', responses: [{ status: 200, body: [botComment] }] },
      {
        method: 'PATCH',
        match: '/issues/comments/42',
        responses: [{ status: 404, body: 'Not Found' }],
      },
      {
        method: 'POST',
        match: '/issues/1/comments',
        responses: [{ status: 201, body: { html_url: 'https://x/c/3' } }],
      },
    ])

    expect(output).toContain(
      'Failed to update existing comment 42, creating a new one'
    )
    expect(output).toContain('Created comment https://x/c/3')
    expect(output).not.toMatch(/^\s+at /m)
    expect(status).toBe(0)
  })

  it('exits 1 with an error annotation and no stack trace on a 404', () => {
    const { status, output } = run('failure', [
      { match: '/jobs?', responses: [{ status: 404, body: 'Not Found' }] },
    ])

    expect(output.match(/\[fetch-stub\] GET \S+\/jobs\?/g)).toHaveLength(1)
    expect(output).toMatch(/^::error .*failed with 404/m)
    expect(output).not.toMatch(/^\s+at /m)
    expect(status).toBe(1)
  })
})
