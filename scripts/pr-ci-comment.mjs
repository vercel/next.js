#!/usr/bin/env node

// Posts the test report comment on a pull request.
//
// This runs from the base repository's default branch, in a privileged
// `workflow_run` workflow that may write to any pull request, while the run it
// reports on is a `pull_request` run whose workflow files, artifacts and job
// logs all belong to the pull request author. Nothing the triggering run
// produces may decide which pull request is written to. The target is resolved
// only from `head_repository`, `head_branch` and `head_sha`, which GitHub mints
// into the `workflow_run` payload.
//
// Without a token the script still resolves a pull request and can dry run,
// because listing pull requests is public. Job logs are not, so a token-less
// dry run of a failing run lists each failed job with a 401 reason.

import { readFile } from 'node:fs/promises'
import { buildTestReport } from './test-report.js'

const TEST_COMMENT_MARKER = '<!-- __NEXT_TEST_REPORT_COMMENT__ -->'
const MAX_COMMENT_LENGTH = 62_000
const MAX_RESULT_MESSAGE_LENGTH = 12_000

const LOG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/
// Strip terminal color/control codes from test output before posting it to GitHub.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /(?:\u001B\][\s\S]*?(?:\u0007|\u001B\\|\u009C))|(?:[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g

const COMMENT_AUTHOR = 'github-actions[bot]'

const API_BASE = (
  process.env.GITHUB_API_URL || 'https://api.github.com'
).replace(/\/+$/, '')

// Conclusions that carry test results. A run that was cancelled, is waiting for
// a maintainer to approve it, or failed to start ran no jobs, so reporting on it
// would overwrite the comment with an empty report.
const REPORTABLE_CONCLUSIONS = new Set(['success', 'failure', 'timed_out'])

class GitHubClient {
  constructor({ token, owner, repo, dryRun }) {
    this.token = token
    this.owner = owner
    this.repo = repo
    this.dryRun = dryRun
  }

  async request(route, options = {}) {
    const res = await this.fetchApi(route, options)

    if (!res.ok) {
      throw new Error(
        await formatResponseError(res, `${options.method || 'GET'} ${route}`)
      )
    }

    if (res.status === 204) {
      return null
    }

    return res.json()
  }

  async fetchApi(route, options = {}) {
    return fetchWithRateLimitRetry(
      `${API_BASE}${route}`,
      {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          'X-GitHub-Api-Version': '2022-11-28',
          ...options.headers,
        },
      },
      `${options.method || 'GET'} ${route}`
    )
  }

  async paginate(route) {
    const results = []
    let page = 1

    while (true) {
      const separator = route.includes('?') ? '&' : '?'
      const data = await this.request(
        `${route}${separator}per_page=100&page=${page}`
      )
      const items = Array.isArray(data)
        ? data
        : data.jobs || data.artifacts || []
      results.push(...items)

      if (items.length < 100) {
        return results
      }

      page += 1
    }
  }

  async listJobsForRunAttempt(runId, runAttempt) {
    return this.paginate(
      `/repos/${this.owner}/${this.repo}/actions/runs/${runId}/attempts/${runAttempt}/jobs`
    )
  }

  async downloadJobLogs(jobId) {
    const route = `/repos/${this.owner}/${this.repo}/actions/jobs/${jobId}/logs`
    const res = await this.fetchApi(route, {
      redirect: 'manual',
    })

    if (!res.ok && res.status !== 302) {
      throw new Error(
        await formatResponseError(res, `GET job logs for job ${jobId}`)
      )
    }

    if (res.status === 302) {
      const location = res.headers.get('location')
      if (!location) {
        throw new Error(`Job ${jobId} log redirect did not include a location`)
      }

      const logsRes = await fetchWithRateLimitRetry(
        location,
        {},
        `GET redirected job logs for job ${jobId}`
      )
      if (!logsRes.ok) {
        throw new Error(
          await formatResponseError(
            logsRes,
            `GET redirected job logs for job ${jobId}`
          )
        )
      }
      return stripLogTimestamps(await logsRes.text())
    }

    return stripLogTimestamps(await res.text())
  }

  async listIssueComments(issueNumber) {
    return this.paginate(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`
    )
  }

  async findExistingBotComment(issueNumber, marker, fallbackHeadings = []) {
    const comments = await this.listIssueComments(issueNumber)
    return [...comments].reverse().find((comment) => {
      if (comment.user?.login !== COMMENT_AUTHOR) {
        return false
      }

      return (
        comment.body?.includes(marker) ||
        fallbackHeadings.some((heading) => comment.body?.includes(heading))
      )
    })
  }

  async upsertIssueComment(issueNumber, marker, body, fallbackHeadings = []) {
    body = fitComment(body)

    const existing = await this.findExistingBotComment(
      issueNumber,
      marker,
      fallbackHeadings
    )

    if (this.dryRun) {
      console.log(
        `[dry-run] ${existing ? 'Would update' : 'Would create'} comment for #${issueNumber}`
      )
      console.log(body)
      return
    }

    if (existing) {
      try {
        await this.request(
          `/repos/${this.owner}/${this.repo}/issues/comments/${existing.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ body }),
          }
        )
        console.log(`Updated comment ${existing.html_url}`)
        return
      } catch (err) {
        console.log(
          `Failed to update existing comment ${existing.id}, creating a new one`,
          err
        )
      }
    }

    const created = await this.request(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    )
    console.log(`Created comment ${created.html_url}`)
  }

  async insertIssueCommentIfMissing(
    issueNumber,
    marker,
    body,
    fallbackHeadings = []
  ) {
    body = fitComment(body)

    const existing = await this.findExistingBotComment(
      issueNumber,
      marker,
      fallbackHeadings
    )

    if (existing) {
      console.log(
        `Existing comment ${existing.html_url} found for #${issueNumber}; requested-phase is create-only, leaving it alone`
      )
      return
    }

    if (this.dryRun) {
      console.log(
        `[dry-run] Would create placeholder comment for #${issueNumber}`
      )
      console.log(body)
      return
    }

    const created = await this.request(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    )
    console.log(`Created placeholder comment ${created.html_url}`)
  }

  async listPullRequestsForHead({ ownerLogin, branch, state }) {
    // Branch names may contain `&`, `=`, `#` and `%`, so the filter cannot be
    // interpolated into the query string.
    const params = new URLSearchParams({
      state,
      head: `${ownerLogin}:${branch}`,
      sort: 'created',
      direction: 'desc',
    })

    return this.paginate(`/repos/${this.owner}/${this.repo}/pulls?${params}`)
  }
}

async function main() {
  const dryRun = process.env.PR_CI_COMMENT_DRY_RUN === '1'
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (!token && !dryRun) {
    throw new Error('Missing GITHUB_TOKEN')
  }

  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) {
    throw new Error('Missing GITHUB_EVENT_PATH')
  }

  const event = JSON.parse(await readFile(eventPath, 'utf8'))
  const workflowRun = event.workflow_run
  if (!workflowRun) {
    throw new Error('This script must run from a workflow_run event')
  }

  const repository =
    event.repository?.full_name || process.env.GITHUB_REPOSITORY || ''
  const [owner, repo] = repository.split('/')

  if (!owner || !repo) {
    throw new Error(
      `Unable to resolve repository owner/name from "${repository}"`
    )
  }

  const phase = event.action
  if (!shouldCommentForWorkflowRun(workflowRun, phase)) {
    return
  }

  const head = getWorkflowRunHead(workflowRun)
  if (!head) {
    return
  }

  const github = new GitHubClient({
    token,
    owner,
    repo,
    dryRun,
  })

  const pull = await resolvePullRequestForWorkflowRun(github, head)
  if (!pull) {
    return
  }

  // A run can come back completed after a new commit landed on the pull
  // request head. The run that commit started owns the comment, and its body is
  // keyed to a different commit, so writing this one would replace a current
  // verdict with a stale one.
  if (pull.headSha !== head.sha) {
    console.log(
      `Pull request #${pull.number} has moved on from ${head.sha} to ${pull.headSha}, a newer run owns the comment, skipping`
    )
    return
  }

  await handleBuildAndTestWorkflow({
    github,
    workflowRun,
    prNumber: pull.number,
    isFork: head.repoFullName !== `${owner}/${repo}`,
    owner,
    repo,
    phase,
  })
}

function shouldCommentForWorkflowRun(workflowRun, phase) {
  // The workflow `if:` filters this too, but a run that no pull request
  // started has nothing to resolve a head branch against.
  if (workflowRun.event !== 'pull_request') {
    console.log(`Ignoring workflow run for "${workflowRun.event}" event`)
    return false
  }

  if (workflowRun.name !== 'build-and-test') {
    console.log(`Ignoring workflow "${workflowRun.name}"`)
    return false
  }

  if (phase === 'requested') {
    return true
  }

  if (phase !== 'completed') {
    console.log(`Ignoring workflow_run action "${phase}"`)
    return false
  }

  if (!REPORTABLE_CONCLUSIONS.has(workflowRun.conclusion)) {
    console.log(
      `Ignoring workflow run that concluded as "${workflowRun.conclusion}", it has no test results to report`
    )
    return false
  }

  return true
}

function getWorkflowRunHead(workflowRun) {
  const branch = workflowRun.head_branch
  const sha = workflowRun.head_sha
  const repoFullName = workflowRun.head_repository?.full_name

  if (!branch || !sha || !repoFullName) {
    console.log(
      `Ignoring workflow run ${workflowRun.id} without a complete head: ${repoFullName}:${branch} at ${sha}`
    )
    return null
  }

  return {
    branch,
    sha,
    repoFullName,
    ownerLogin:
      workflowRun.head_repository.owner?.login || repoFullName.split('/')[0],
  }
}

async function resolvePullRequestForWorkflowRun(github, head) {
  const pull =
    selectPullRequest(
      await github.listPullRequestsForHead({
        ownerLogin: head.ownerLogin,
        branch: head.branch,
        state: 'open',
      }),
      head,
      { requireHeadSha: false }
    ) ||
    // A closed pull request whose branch was reused must never shadow the open
    // one, so it only counts for the exact commit this run reported on.
    selectPullRequest(
      await github.listPullRequestsForHead({
        ownerLogin: head.ownerLogin,
        branch: head.branch,
        state: 'all',
      }),
      head,
      { requireHeadSha: true }
    )

  if (!pull) {
    console.log(
      `No pull request found for ${head.ownerLogin}:${head.branch}, skipping`
    )
    return null
  }

  console.log(
    `Resolved #${pull.number} for ${head.ownerLogin}:${head.branch} at ${head.sha}`
  )
  return { number: pull.number, headSha: pull.head.sha }
}

function selectPullRequest(pulls, head, { requireHeadSha }) {
  const candidates = (pulls || []).filter(
    (pull) =>
      pull.head?.ref === head.branch &&
      pull.head?.repo?.full_name === head.repoFullName &&
      (!requireHeadSha || pull.head?.sha === head.sha)
  )

  if (candidates.length > 1) {
    console.log(
      `Found ${candidates.length} pull requests for ${head.ownerLogin}:${head.branch}: ${candidates
        .map((pull) => `#${pull.number}`)
        .join(', ')}`
    )
  }

  // One branch can back several pull requests with different bases, and the
  // payload carries no base ref to tell them apart, so pick deterministically
  // rather than give up on a legitimate run.
  return [...candidates].sort(
    (a, b) =>
      Number(b.head.sha === head.sha) - Number(a.head.sha === head.sha) ||
      Number(b.state === 'open') - Number(a.state === 'open') ||
      b.number - a.number
  )[0]
}

async function handleBuildAndTestWorkflow({
  github,
  workflowRun,
  prNumber,
  isFork,
  owner,
  repo,
  phase,
}) {
  if (phase === 'requested') {
    // A fork run waits for a maintainer to approve it, and the
    // `action_required` conclusion it gets if nobody does is not reported, so
    // the placeholder would be left claiming tests are running forever.
    if (isFork) {
      console.log(
        `Skipping the in-progress comment for #${prNumber}, a fork run may never start`
      )
      return
    }

    const body = [
      TEST_COMMENT_MARKER,
      '## Tests in progress',
      '',
      `Commit: ${workflowRun.head_sha}`,
      `[View workflow run](${workflowRun.html_url})`,
      '',
    ].join('\n')

    await github.insertIssueCommentIfMissing(
      prNumber,
      TEST_COMMENT_MARKER,
      body,
      ['## Failing test suites', '## Failing CI jobs']
    )
    return
  }

  if (workflowRun.conclusion === 'success') {
    const body = [
      TEST_COMMENT_MARKER,
      '## Tests Passed',
      '',
      '<!-- ## Failing test suites -->',
      `Commit: ${workflowRun.head_sha}`,
      `[View workflow run](${workflowRun.html_url})`,
      '',
    ].join('\n')

    await github.upsertIssueComment(prNumber, TEST_COMMENT_MARKER, body, [
      '## Failing test suites',
      '## Failing CI jobs',
    ])
    return
  }

  const jobs = await github.listJobsForRunAttempt(
    workflowRun.id,
    workflowRun.run_attempt || 1
  )
  const failedJobs = jobs.filter(
    (job) =>
      ['failure', 'timed_out'].includes(job.conclusion) &&
      job.name !== 'thank you, next'
  )

  const failedSuites = []
  const otherFailures = []

  await mapLimit(failedJobs, 4, async (job) => {
    let logs = ''
    try {
      logs = await github.downloadJobLogs(job.id)
    } catch (err) {
      otherFailures.push({ job, reason: err.message })
      return
    }

    const parsedSuites = parseFailedSuitesFromLogs(logs, job)

    if (parsedSuites.length === 0) {
      otherFailures.push({ job })
    } else {
      failedSuites.push(...parsedSuites)
    }
  })

  const body = buildTestReportComment({
    failedSuites,
    otherFailures,
    owner,
    repo,
    sha: workflowRun.head_sha,
  })

  await github.upsertIssueComment(prNumber, TEST_COMMENT_MARKER, body, [
    '## Failing test suites',
    '## Failing CI jobs',
  ])
}

function parseFailedSuitesFromLogs(logs, job) {
  const blocks = extractJsonBlocks(logs)
  const failedSuites = []

  for (const testData of blocks) {
    const testResults = testData.testResults || []
    for (const testResult of testResults) {
      const failedAssertions = (testResult.assertionResults || []).filter(
        (res) => res.status === 'failed'
      )
      const failed =
        testResult.status === 'failed' ||
        failedAssertions.length > 0 ||
        (testResults.length === 1 && testData.numFailedTests > 0)

      if (!failed) {
        continue
      }

      const groupedFails = new Map()
      for (const fail of failedAssertions) {
        const ancestorKey = (fail.ancestorTitles || []).join(' > ')
        if (!groupedFails.has(ancestorKey)) {
          groupedFails.set(ancestorKey, [])
        }
        groupedFails.get(ancestorKey).push(fail)
      }

      failedSuites.push({
        job,
        mode: testData.processEnv?.NEXT_TEST_MODE,
        testPath: normalizeTestPath(testResult.name),
        resultMessage: truncate(
          stripAnsi(testResult.message || collectFailureMessages(testResult)),
          MAX_RESULT_MESSAGE_LENGTH
        ),
        groups: groupedFails,
      })
    }
  }

  return failedSuites
}

function extractJsonBlocks(logs) {
  const blocks = []
  const re = /--test output start--\s*(\{[\s\S]*?\})\s*--test output end--/g
  let match

  while ((match = re.exec(logs))) {
    try {
      blocks.push(JSON.parse(match[1]))
    } catch (err) {
      console.log('Failed to parse test output block', err)
    }
  }

  return blocks
}

function buildTestReportComment({
  failedSuites,
  otherFailures,
  owner,
  repo,
  sha,
}) {
  const suites = failedSuites
    .sort((a, b) =>
      `${a.job.name}:${a.testPath}`.localeCompare(`${b.job.name}:${b.testPath}`)
    )
    .map((suite) => {
      // Unlike `run-tests.js`, which reads them from its environment, the
      // suite properties have to be derived from the CI job name here.
      const jobName = suite.job.name.toLowerCase()
      const isCacheComponents = jobName.includes('cache components')

      return {
        jobName: suite.job.name,
        jobUrl: suite.job.html_url,
        mode: suite.mode,
        testPath: suite.testPath,
        isTurbopack: jobName.includes('turbopack') || isCacheComponents,
        isRspack: jobName.includes('rspack'),
        isExperimental: jobName.includes('experimental') || isCacheComponents,
        isPPR: jobName.includes('ppr'),
        failedCases: [...suite.groups.keys()]
          .sort()
          .flatMap((group) =>
            suite.groups
              .get(group)
              .map((fail) => `${group ? `${group} > ` : ''}${fail.title}`)
          ),
        resultMessage: suite.resultMessage,
      }
    })

  return buildTestReport({
    marker: TEST_COMMENT_MARKER,
    owner,
    repo,
    sha,
    suites,
    otherFailures: otherFailures
      .sort((a, b) => a.job.name.localeCompare(b.job.name))
      .map(({ job, reason }) => ({
        name: job.name,
        url: job.html_url,
        reason,
      })),
  })
}

function normalizeTestPath(testName) {
  const normalized = String(testName || '').replaceAll('\\', '/')
  const match = normalized.match(/(?:^|\/)(test\/.*)$/)
  return match?.[1] || normalized
}

function collectFailureMessages(testResult) {
  return (testResult.assertionResults || [])
    .flatMap((assertion) => assertion.failureMessages || [])
    .join('\n\n')
}

function stripLogTimestamps(logs) {
  return logs
    .split('\n')
    .map((line) => line.replace(LOG_TIMESTAMP_RE, ''))
    .join('\n')
}

function stripAnsi(value) {
  return String(value || '').replace(ANSI_RE, '')
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}\n\n... truncated ...`
}

function fitComment(body) {
  if (body.length <= MAX_COMMENT_LENGTH) {
    return body
  }

  return `${body.slice(0, MAX_COMMENT_LENGTH)}\n\n... truncated to fit in one GitHub comment ...`
}

async function fetchWithRateLimitRetry(url, options, description) {
  const res = await fetch(url, options)
  const retryDelay = getRetryAfterMs(res.headers)

  if ((res.status === 403 || res.status === 429) && retryDelay !== null) {
    console.log(
      `${description} was rate limited; retrying after ${Math.ceil(retryDelay / 1000)}s`
    )
    await sleep(retryDelay)
    return fetch(url, options)
  }

  return res
}

async function formatResponseError(res, description) {
  const text = await res.text().catch(() => '')
  const details = formatRateLimitDetails(res.headers)
  return `${description} failed with ${res.status}${details ? ` (${details})` : ''}: ${text}`
}

function formatRateLimitDetails(headers) {
  const details = []
  const remaining = headers.get('x-ratelimit-remaining')
  const resource = headers.get('x-ratelimit-resource')
  const retryAfter = headers.get('retry-after')
  const reset = headers.get('x-ratelimit-reset')

  if (remaining !== null) {
    details.push(`remaining=${remaining}`)
  }
  if (resource) {
    details.push(`resource=${resource}`)
  }
  if (reset) {
    details.push(`reset=${formatRateLimitReset(reset)}`)
  }
  if (retryAfter) {
    details.push(`retry-after=${retryAfter}`)
  }

  return details.join(', ')
}

function formatRateLimitReset(value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }

  return `${value}/${new Date(timestamp * 1000).toISOString()}`
}

function getRetryAfterMs(headers) {
  const retryAfter = headers.get('retry-after')
  if (!retryAfter) {
    return null
  }

  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const retryAt = Date.parse(retryAfter)
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now())
  }

  return null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mapLimit(items, limit, mapper) {
  const queue = [...items]
  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        await mapper(item)
      }
    }
  )

  await Promise.all(workers)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
