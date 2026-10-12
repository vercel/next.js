const fs = require('node:fs')

const REOPEN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const AUTOMATED_CLOSURE_MARKER = '<!-- issue-reopen:automated-closure -->'

class GitHubClient {
  constructor(token) {
    this.token = token
    this.apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com'
  }

  async request(method, endpoint, body) {
    const url = new URL(endpoint, this.apiUrl)
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'next.js-issue-reopen-action',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) : undefined

    if (!response.ok) {
      const error = new Error(
        `GitHub API request failed (${response.status}): ${data?.message || response.statusText}`
      )
      error.status = response.status
      throw error
    }

    return { data, headers: response.headers, url: response.url }
  }

  async get(endpoint) {
    return (await this.request('GET', endpoint)).data
  }

  async getLastPage(endpoint) {
    const url = new URL(endpoint, this.apiUrl)
    url.searchParams.set('per_page', '100')

    const firstPage = await this.request('GET', url)
    const lastPageUrl = getLink(firstPage.headers.get('link'), 'last')

    if (!lastPageUrl || lastPageUrl === firstPage.url) {
      return firstPage.data
    }

    return (await this.request('GET', lastPageUrl)).data
  }

  async post(endpoint, body) {
    return (await this.request('POST', endpoint, body)).data
  }

  async patch(endpoint, body) {
    return (await this.request('PATCH', endpoint, body)).data
  }
}

function getLink(header, relation) {
  if (!header) return undefined

  for (const link of header.split(',')) {
    const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/)
    if (match?.[2] === relation) return match[1]
  }

  return undefined
}

function isAutomationUser(user) {
  return user.type === 'Bot' || user.login.toLowerCase().endsWith('-bot')
}

function findCurrentClosureIndex(timeline, issue) {
  for (let index = timeline.length - 1; index >= 0; index--) {
    const event = timeline[index]

    if (
      event.event === 'closed' &&
      event.created_at === issue.closed_at &&
      event.actor?.id === issue.closed_by?.id
    ) {
      return index
    }
  }

  return -1
}

function findPreviousReopenTime(timeline, closureIndex) {
  for (let index = closureIndex - 1; index >= 0; index--) {
    if (timeline[index].event === 'reopened') {
      return Date.parse(timeline[index].created_at)
    }
  }

  return -Infinity
}

async function handleIssueReopening({
  client,
  eventName,
  payload,
  owner,
  repo,
  log = console.log,
}) {
  const eventIssue = payload.issue
  const issuePath = `/repos/${owner}/${repo}/issues/${eventIssue.number}`

  async function hasTriagePermission(user) {
    if (user?.type !== 'User' || isAutomationUser(user)) return false

    try {
      const data = await client.get(
        `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(user.login)}/permission`
      )

      return Boolean(data.user?.permissions?.triage)
    } catch (error) {
      if (error.status === 404) return false
      throw error
    }
  }

  async function getIssue() {
    return client.get(issuePath)
  }

  async function getTimeline() {
    return client.getLastPage(`${issuePath}/timeline`)
  }

  if (eventName === 'issues') {
    const issue = await getIssue()

    if (
      issue.state !== 'closed' ||
      issue.locked ||
      issue.pull_request ||
      issue.closed_at !== eventIssue.closed_at ||
      issue.closed_by?.id !== payload.sender?.id
    ) {
      log('Skipping a stale, open, locked, or non-issue closure')
      return
    }

    if (!(await hasTriagePermission(issue.closed_by))) {
      log('Skipping a closure not performed by a maintainer')
      return
    }

    const timeline = await getTimeline()
    const closureIndex = findCurrentClosureIndex(timeline, issue)

    if (closureIndex === -1) {
      log('Skipping a closure missing from the issue timeline')
      return
    }

    const marker = `<!-- issue-reopen-window:${timeline[closureIndex].id} -->`
    const comments = await client.getLastPage(`${issuePath}/comments`)

    const alreadyCommented = comments.some(
      (comment) =>
        comment.user?.login === 'github-actions[bot]' &&
        comment.body?.includes(marker)
    )

    if (alreadyCommented) {
      log('The reopening instructions were already posted')
      return
    }

    const closedAt = Date.parse(issue.closed_at)
    const previousReopenAt = findPreviousReopenTime(timeline, closureIndex)
    const wasAutomaticallyClosed = comments.some((comment) => {
      if (
        comment.user?.login !== 'github-actions[bot]' ||
        !comment.body?.includes(AUTOMATED_CLOSURE_MARKER)
      ) {
        return false
      }

      const commentedAt = Date.parse(comment.created_at)
      return commentedAt >= previousReopenAt && commentedAt <= closedAt
    })

    if (wasAutomaticallyClosed) {
      log('Skipping an automated closure with existing instructions')
      return
    }

    const body = `This issue was closed by a maintainer. If you think it was closed by mistake, you can request that it be reopened within the next 14 days.

Reply with \`Reopen: <reason>\` and explain why the issue is still relevant. If you opened this issue or commented before it was closed, the issue will be reopened automatically.

After 14 days, please open a new issue with up-to-date details and a reproduction, when applicable.

${marker}`

    await client.post(`${issuePath}/comments`, { body })

    log(`Posted reopening instructions on issue #${issue.number}`)
    return
  }

  const comment = payload.comment
  const command = comment?.body?.match(/\breopen\s*:\s*\S.*$/is)

  if (!comment || isAutomationUser(comment.user) || !command) {
    log('Skipping an invalid reopening request')
    return
  }

  const issue = await getIssue()

  if (issue.state !== 'closed' || issue.locked || issue.pull_request) {
    log('Skipping a request for an open, locked, or non-issue')
    return
  }

  const closedAt = Date.parse(issue.closed_at)
  const requestedAt = Date.parse(comment.created_at)

  if (
    !Number.isFinite(closedAt) ||
    !Number.isFinite(requestedAt) ||
    requestedAt < closedAt ||
    requestedAt - closedAt > REOPEN_WINDOW_MS
  ) {
    log('Skipping a reopening request outside the 14-day window')
    return
  }

  if (!(await hasTriagePermission(issue.closed_by))) {
    log('Skipping a request for a non-maintainer closure')
    return
  }

  const requesterId = comment.user.id
  let isParticipant = issue.user?.id === requesterId

  if (!isParticipant) {
    const timeline = await getTimeline()
    const closureIndex = findCurrentClosureIndex(timeline, issue)

    if (closureIndex === -1) {
      log('Skipping a request missing its closure timeline event')
      return
    }

    isParticipant = timeline
      .slice(0, closureIndex)
      .some(
        (event) => event.event === 'commented' && event.user?.id === requesterId
      )
  }

  if (!isParticipant) {
    log('Skipping a request from someone who did not participate')
    return
  }

  await client.patch(issuePath, {
    state: 'open',
    state_reason: 'reopened',
  })

  log(`Reopened issue #${issue.number}`)
}

async function main() {
  const token = process.env.GITHUB_TOKEN
  const eventPath = process.env.GITHUB_EVENT_PATH
  const repository = process.env.GITHUB_REPOSITORY

  if (!token || !eventPath || !repository) {
    throw new Error(
      'GITHUB_TOKEN, GITHUB_EVENT_PATH, and GITHUB_REPOSITORY are required'
    )
  }

  const [owner, repo] = repository.split('/')
  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'))

  await handleIssueReopening({
    client: new GitHubClient(token),
    eventName: process.env.GITHUB_EVENT_NAME,
    payload,
    owner,
    repo,
  })
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = {
  GitHubClient,
  handleIssueReopening,
}
