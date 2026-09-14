const fs = require('node:fs/promises')

const API_ORIGIN = 'https://next-maintainer-pr-reviewer.playground-vercel.tools'
const OIDC_AUDIENCE = 'next-maintainer-pr-reviewer'
const OWNER = 'vercel'
const REPOSITORY = 'next.js'
const STATE_FILE = `${process.env.RUNNER_TEMP}/automated-code-review.json`

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function prepareReviewComment({ core, github, context }) {
  const pullRequest = context.payload.pull_request
  const number = pullRequest.number
  const deadline = Date.now() + 50 * 60 * 1000
  const marker = `<!-- next-maintainer-pr-review:v2:vercel/next.js#${number} -->`

  let oidcToken
  let refreshOidcAt = 0

  async function request(method, path, body) {
    if (Date.now() >= refreshOidcAt) {
      oidcToken = await core.getIDToken(OIDC_AUDIENCE)
      core.setSecret(oidcToken)
      refreshOidcAt = Date.now() + 4 * 60 * 1000
    }
    const response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    })
    let data
    try {
      data = await response.json()
    } catch {
      throw new Error(`Reviewer API ${method} returned malformed JSON.`)
    }
    return { data, status: response.status }
  }

  let started
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await request('POST', '/api/github/pr-review', { number })
    if (response.status === 202) {
      started = response.data
      break
    }
    if (
      response.status === 409 &&
      response.data?.error === 'ineligible_pull_request'
    ) {
      core.info('The pull request is not eligible for automated review.')
      return
    }
    if (response.status !== 409 || response.data?.error !== 'review_starting') {
      throw new Error(`Reviewer API POST returned status ${response.status}.`)
    }
    await wait(2_000)
  }
  if (
    !started ||
    typeof started.reviewId !== 'string' ||
    !/^wrun_[A-Za-z0-9]{10,80}$/.test(started.reviewId) ||
    started.headSha !== pullRequest.head.sha
  ) {
    throw new Error('Reviewer API returned an invalid review handle.')
  }

  let result
  let pollFailures = 0
  while (Date.now() < deadline) {
    let response
    try {
      response = await request(
        'GET',
        `/api/github/pr-review/${started.reviewId}`
      )
      if (response.status !== 200) {
        throw new Error(`Reviewer API GET returned status ${response.status}.`)
      }
      pollFailures = 0
    } catch (error) {
      pollFailures += 1
      if (pollFailures >= 3) throw error
      await wait(30_000)
      continue
    }
    if (response.data?.status === 'failed') {
      throw new Error('Automated review failed.')
    }
    if (response.data?.status === 'completed') {
      result = response.data.result
      break
    }
    if (response.data?.status !== 'running') {
      throw new Error('Reviewer API GET returned an invalid status.')
    }
    await wait(30_000)
  }
  if (!result) throw new Error('Automated review timed out after 50 minutes.')
  if (
    result.repository !== 'vercel/next.js' ||
    result.number !== number ||
    !/^[a-f0-9]{40}$/.test(result.baseSha) ||
    result.headSha !== pullRequest.head.sha ||
    typeof result.synthesis !== 'string'
  ) {
    throw new Error('The review result does not match this pull request.')
  }

  const snapshot = await github.graphql(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          authorAssociation
          baseRefName
          baseRefOid
          headRefOid
          isDraft
          state
        }
      }
    }`,
    { owner: OWNER, repo: REPOSITORY, number }
  )
  const current = snapshot.repository?.pullRequest
  if (
    current?.state !== 'OPEN' ||
    current.isDraft ||
    current.authorAssociation !== 'MEMBER' ||
    current.baseRefName !== pullRequest.base.ref ||
    current.headRefOid !== result.headSha ||
    current.baseRefOid !== result.baseSha
  ) {
    core.warning('The pull request changed while review was running.')
    return
  }

  const synthesis = result.synthesis
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replaceAll('<!--', '')
    .replaceAll('-->', '')
    .replaceAll('pr-review-gateway-placeholder', '[REDACTED]')
    .replaceAll('pr-review-github-placeholder', '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu, 'Bearer [REDACTED]')
    .replace(/\bgh[opsur]_[A-Za-z0-9_]{16,}\b/gu, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu, '[REDACTED]')
    .replace(/@(?=[A-Za-z0-9_])/gu, '@\u200b')
    .trim()
  const body = `${marker}\n\n## Automated code review findings\n\n${synthesis}`
  if (!synthesis || Buffer.byteLength(body, 'utf8') > 48_000) {
    throw new Error('The review comment is empty or exceeds 48 KB.')
  }

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner: OWNER,
    repo: REPOSITORY,
    issue_number: number,
    per_page: 100,
  })
  const generalAppIds = new Set([3623420, 3623469])
  const matches = comments.filter(
    (comment) =>
      comment.user?.type === 'Bot' &&
      generalAppIds.has(Number(comment.performed_via_github_app?.id)) &&
      comment.body?.startsWith(marker)
  )
  if (matches.length > 1) {
    throw new Error('Multiple authenticated review comments exist.')
  }

  await fs.writeFile(
    STATE_FILE,
    JSON.stringify({
      baseRef: pullRequest.base.ref,
      baseSha: result.baseSha,
      body,
      commentId: matches[0]?.id ?? null,
      headSha: result.headSha,
      number,
    }),
    { encoding: 'utf8', mode: 0o600 }
  )
  core.setOutput('publish', 'true')
}

async function publishReviewComment({ core, github }) {
  const state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'))
  if (
    !Number.isSafeInteger(state.number) ||
    state.number <= 0 ||
    typeof state.body !== 'string' ||
    Buffer.byteLength(state.body, 'utf8') > 48_000 ||
    !/^[a-f0-9]{40}$/.test(state.baseSha) ||
    !/^[a-f0-9]{40}$/.test(state.headSha) ||
    typeof state.baseRef !== 'string' ||
    (state.commentId !== null &&
      (!Number.isSafeInteger(state.commentId) || state.commentId <= 0))
  ) {
    throw new Error('The prepared review comment is invalid.')
  }

  const readToken = process.env.READ_TOKEN
  if (!readToken) throw new Error('The read-only GitHub token is unavailable.')
  core.setSecret(readToken)
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${readToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      query: `query($number: Int!) {
        repository(owner: "vercel", name: "next.js") {
          pullRequest(number: $number) {
            authorAssociation
            baseRefName
            baseRefOid
            headRefOid
            isDraft
            state
          }
        }
      }`,
      variables: { number: state.number },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) {
    throw new Error(
      `Final pull request validation returned status ${response.status}.`
    )
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('Final pull request validation returned malformed JSON.')
  }
  if (payload.errors?.length) {
    throw new Error('Final pull request validation returned GraphQL errors.')
  }
  const pullRequest = payload.data?.repository?.pullRequest
  if (
    pullRequest?.state !== 'OPEN' ||
    pullRequest.isDraft ||
    pullRequest.authorAssociation !== 'MEMBER' ||
    pullRequest.baseRefName !== state.baseRef ||
    pullRequest.headRefOid !== state.headSha ||
    pullRequest.baseRefOid !== state.baseSha
  ) {
    throw new Error('The pull request changed before publication.')
  }

  if (state.commentId) {
    await github.rest.issues.updateComment({
      owner: OWNER,
      repo: REPOSITORY,
      comment_id: state.commentId,
      body: state.body,
    })
  } else {
    await github.rest.issues.createComment({
      owner: OWNER,
      repo: REPOSITORY,
      issue_number: state.number,
      body: state.body,
    })
  }
}

module.exports = { prepareReviewComment, publishReviewComment }
