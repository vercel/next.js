import { execFile } from 'child_process'
import { createServer, type Server } from 'http'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { AddressInfo } from 'net'

const execFileAsync = promisify(execFile)

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'pr-ci-comment.mjs')
const MARKER = '<!-- __NEXT_TEST_REPORT_COMMENT__ -->'
const REPO = 'vercel/next.js'
const RUN_SHA = 'a'.repeat(40)

type PullStub = {
  number: number
  state: 'open' | 'closed'
  head: { ref: string; sha: string; repo: { full_name: string } | null }
}

type CommentStub = {
  id: number
  user: { login: string }
  body: string
  html_url: string
}

type RecordedRequest = {
  method: string
  pathname: string
  search: URLSearchParams
  body: Record<string, string> | undefined
}

let server: Server
let apiUrl: string
let requests: RecordedRequest[]
let pulls: PullStub[]
let pullsOverride: PullStub[] | null
let comments: Map<number, CommentStub[]>
let nextCommentId: number
let tmpDirs: string[]

function respond(
  method: string,
  url: URL,
  body: Record<string, string> | undefined
): [number, unknown] {
  if (url.pathname === `/repos/${REPO}/pulls`) {
    if (pullsOverride) {
      return [200, pullsOverride]
    }

    const head = url.searchParams.get('head')
    const state = url.searchParams.get('state')

    return [
      200,
      pulls.filter((pull) => {
        if (state !== 'all' && pull.state !== state) {
          return false
        }
        const owner = pull.head.repo?.full_name.split('/')[0]
        return !head || head === `${owner}:${pull.head.ref}`
      }),
    ]
  }

  const issueComments = url.pathname.match(
    new RegExp(`^/repos/${REPO}/issues/(\\d+)/comments$`)
  )
  if (issueComments) {
    const number = Number(issueComments[1])
    if (method === 'GET') {
      return [200, comments.get(number) || []]
    }

    const comment: CommentStub = {
      id: nextCommentId++,
      user: { login: 'github-actions[bot]' },
      body: String(body?.body),
      html_url: `https://github.com/${REPO}/pull/${number}#issuecomment-1`,
    }
    comments.set(number, [...(comments.get(number) || []), comment])
    return [201, comment]
  }

  const editComment = url.pathname.match(
    new RegExp(`^/repos/${REPO}/issues/comments/(\\d+)$`)
  )
  if (editComment) {
    const id = Number(editComment[1])
    for (const list of comments.values()) {
      const existing = list.find((comment) => comment.id === id)
      if (existing) {
        existing.body = String(body?.body)
        return [200, existing]
      }
    }
  }

  return [404, { message: `no stub for ${method} ${url.pathname}` }]
}

beforeAll(async () => {
  server = createServer((req, res) => {
    // 127.0.0.1 rather than localhost: localhost can resolve to ::1 and miss
    // the listener.
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined
      requests.push({
        method: req.method || 'GET',
        pathname: url.pathname,
        search: url.searchParams,
        body,
      })
      const [status, payload] = respond(req.method || 'GET', url, body)
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  requests = []
  pulls = []
  pullsOverride = null
  comments = new Map()
  nextCommentId = 100
  tmpDirs = []
})

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

function workflowRunEvent({
  action = 'completed',
  conclusion = 'success',
  branch = 'feature',
  sha = RUN_SHA,
  headRepo = 'attacker/next.js',
}: {
  action?: string
  conclusion?: string | null
  branch?: string
  sha?: string
  headRepo?: string
} = {}) {
  return {
    action,
    repository: { full_name: REPO },
    workflow_run: {
      id: 42,
      name: 'build-and-test',
      event: 'pull_request',
      conclusion: action === 'completed' ? conclusion : null,
      run_attempt: 1,
      head_branch: branch,
      head_sha: sha,
      head_repository: {
        full_name: headRepo,
        owner: { login: headRepo.split('/')[0] },
      },
      html_url: `https://github.com/${REPO}/actions/runs/42`,
      pull_requests: [],
    },
  }
}

function pullStub({
  number,
  state = 'open',
  branch = 'feature',
  sha = RUN_SHA,
  headRepo = 'attacker/next.js',
}: {
  number: number
  state?: 'open' | 'closed'
  branch?: string
  sha?: string
  headRepo?: string
}): PullStub {
  return {
    number,
    state,
    head: { ref: branch, sha, repo: { full_name: headRepo } },
  }
}

async function runScript(
  event: ReturnType<typeof workflowRunEvent>,
  { artifact }: { artifact?: Record<string, unknown> } = {}
) {
  const cwd = await mkdtemp(join(tmpdir(), 'pr-ci-comment-'))
  tmpDirs.push(cwd)

  const eventPath = join(cwd, 'event.json')
  await writeFile(eventPath, JSON.stringify(event))

  if (artifact) {
    await mkdir(join(cwd, 'pr-ci-metadata'))
    await writeFile(
      join(cwd, 'pr-ci-metadata', 'pr.json'),
      JSON.stringify(artifact)
    )
  }

  const env = { ...process.env }
  // The suite itself runs inside GitHub Actions, where all of these are set.
  for (const name of [
    'GITHUB_EVENT_PATH',
    'GITHUB_API_URL',
    'GITHUB_REPOSITORY',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'PR_CI_METADATA_PATH',
    'PR_CI_COMMENT_DRY_RUN',
  ]) {
    delete env[name]
  }

  // Must not be spawnSync: the stub server runs on this process's event loop,
  // so a blocking child would deadlock waiting for a response that can never
  // be written.
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT], {
    cwd,
    env: {
      ...env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_API_URL: apiUrl,
      GITHUB_TOKEN: 'test-token',
    },
  })

  return { stdout, stderr }
}

function writeRequests() {
  return requests.filter((request) => request.method !== 'GET')
}

describe('pr-ci-comment', () => {
  it('ignores a pull request named by the downloaded artifact', async () => {
    // The artifact comes from the untrusted `pull_request` run, so a fork
    // author can name any pull request in it, together with that pull
    // request's real head SHA and their own branch and repository.
    pulls = [pullStub({ number: 2000 })]
    comments.set(1000, [
      {
        id: 7,
        user: { login: 'github-actions[bot]' },
        body: `${MARKER}\n## Failing test suites`,
        html_url: 'https://github.com/vercel/next.js/pull/1000',
      },
    ])

    const { stdout } = await runScript(workflowRunEvent(), {
      artifact: {
        number: 1000,
        headSha: 'b'.repeat(40),
        headRef: 'feature',
        headRepo: 'attacker/next.js',
        baseRef: 'canary',
        isFork: true,
      },
    })

    expect(requests.filter((r) => r.pathname.includes('1000'))).toEqual([])
    expect(comments.get(1000)?.[0].body).toContain('## Failing test suites')
    expect(comments.get(2000)?.[0].body).toContain('## Tests Passed')
    expect(stdout).toContain('Resolved #2000')
  })

  it.each([
    'cancelled',
    'action_required',
    'startup_failure',
    'neutral',
    'skipped',
    'stale',
    null,
  ])('makes no request for a run concluded as %s', async (conclusion) => {
    pulls = [pullStub({ number: 2000 })]

    const { stdout } = await runScript(workflowRunEvent({ conclusion }))

    expect(requests).toEqual([])
    expect(stdout).toContain('no test results to report')
  })

  it('declines to comment once the pull request head has moved on', async () => {
    pulls = [pullStub({ number: 2000, sha: 'c'.repeat(40) })]

    const { stdout } = await runScript(workflowRunEvent())

    expect(writeRequests()).toEqual([])
    expect(stdout).toContain('a newer run owns the comment')
    expect(stdout).not.toContain('No pull request found')
  })

  it('ignores a pull request whose head does not match the workflow run', async () => {
    // What a head filter that an attacker managed to subvert would return.
    pullsOverride = [
      pullStub({ number: 1000, branch: 'canary', headRepo: REPO }),
    ]

    const { stdout } = await runScript(workflowRunEvent())

    expect(writeRequests()).toEqual([])
    expect(stdout).toContain('No pull request found')
  })

  it('encodes the head filter so a branch name cannot add parameters', async () => {
    // git allows `&` and `=` in a ref name, so an unencoded branch could
    // append its own query parameters.
    const branch = 'evil&state=all&head=vercel'
    pulls = [pullStub({ number: 2000, branch })]

    await runScript(workflowRunEvent({ branch }))

    const listed = requests.filter((r) => r.pathname.endsWith('/pulls'))
    expect(listed).toHaveLength(1)
    expect(listed[0].search.getAll('head')).toEqual([`attacker:${branch}`])
    expect(listed[0].search.getAll('state')).toEqual(['open'])
  })

  it('ignores a workflow run whose head branch is not a usable ref', async () => {
    pulls = [pullStub({ number: 2000 })]

    const { stdout } = await runScript(
      workflowRunEvent({ branch: 'evil:head=vercel' })
    )

    expect(requests).toEqual([])
    expect(stdout).toContain('unusable head branch')
  })

  it('updates the existing comment when the run succeeds', async () => {
    pulls = [pullStub({ number: 2000 })]
    comments.set(2000, [
      {
        id: 7,
        user: { login: 'github-actions[bot]' },
        body: `${MARKER}\n## Failing test suites`,
        html_url: 'https://github.com/vercel/next.js/pull/2000',
      },
    ])

    await runScript(workflowRunEvent())

    expect(writeRequests().map((r) => [r.method, r.pathname])).toEqual([
      ['PATCH', `/repos/${REPO}/issues/comments/7`],
    ])
    expect(comments.get(2000)).toHaveLength(1)
    expect(comments.get(2000)?.[0].body).toContain('## Tests Passed')
  })

  it('creates a comment when the run succeeds and none exists', async () => {
    pulls = [pullStub({ number: 2000 })]

    await runScript(workflowRunEvent())

    expect(writeRequests().map((r) => [r.method, r.pathname])).toEqual([
      ['POST', `/repos/${REPO}/issues/2000/comments`],
    ])
    expect(comments.get(2000)?.[0].body).toContain(`Commit: ${RUN_SHA}`)
  })

  it('creates the in-progress comment for a branch run', async () => {
    pulls = [pullStub({ number: 2000, headRepo: REPO })]

    await runScript(workflowRunEvent({ action: 'requested', headRepo: REPO }))

    expect(comments.get(2000)?.[0].body).toContain('## Tests in progress')
  })

  it('skips the in-progress comment for a fork run', async () => {
    pulls = [pullStub({ number: 2000 })]

    const { stdout } = await runScript(
      workflowRunEvent({ action: 'requested' })
    )

    expect(writeRequests()).toEqual([])
    expect(stdout).toContain('a fork run may never start')
  })

  it('prefers the open pull request sharing a head branch', async () => {
    pulls = [
      pullStub({ number: 1500, state: 'closed' }),
      pullStub({ number: 2000 }),
    ]

    await runScript(workflowRunEvent())

    expect(comments.has(1500)).toBe(false)
    expect(comments.get(2000)?.[0].body).toContain('## Tests Passed')
  })

  it('falls back to a closed pull request only for its own head commit', async () => {
    pulls = [pullStub({ number: 1500, state: 'closed', sha: 'd'.repeat(40) })]

    const stale = await runScript(workflowRunEvent())
    expect(writeRequests()).toEqual([])
    expect(stale.stdout).toContain('No pull request found')

    pulls = [pullStub({ number: 1500, state: 'closed' })]

    await runScript(workflowRunEvent())
    expect(comments.get(1500)?.[0].body).toContain('## Tests Passed')
  })
})
