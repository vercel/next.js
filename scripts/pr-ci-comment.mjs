#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const TEST_COMMENT_MARKER = '<!-- __NEXT_TEST_REPORT_COMMENT__ -->'
const STATS_COMMENT_MARKER = '<!-- __NEXT_STATS_COMMENT__ -->'
const CONTRIBUTING_URL =
  'https://github.com/vercel/next.js/blob/canary/contributing.md'
const MAX_COMMENT_LENGTH = 62_000
const MAX_RESULT_MESSAGE_LENGTH = 12_000

const LOG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/
// Strip terminal color/control codes from test output before posting it to GitHub.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /(?:\u001B\][\s\S]*?(?:\u0007|\u001B\\|\u009C))|(?:[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g

const COMMENT_AUTHOR = 'github-actions[bot]'

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
      `https://api.github.com${route}`,
      {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
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

  async upsertIssueComment(issueNumber, marker, body, fallbackHeadings = []) {
    body = fitComment(body)

    const comments = await this.listIssueComments(issueNumber)
    const existing = [...comments].reverse().find((comment) => {
      if (comment.user?.login !== COMMENT_AUTHOR) {
        return false
      }

      return (
        comment.body?.includes(marker) ||
        fallbackHeadings.some((heading) => comment.body?.includes(heading))
      )
    })

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

  async findPullRequestForCommit(sha) {
    const pulls = await this.request(
      `/repos/${this.owner}/${this.repo}/commits/${sha}/pulls`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      }
    )

    return pulls?.[0]
  }

  async getPullRequest(number) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/${number}`)
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

  const [owner, repo] = (
    event.repository?.full_name ||
    process.env.GITHUB_REPOSITORY ||
    ''
  ).split('/')

  if (!owner || !repo) {
    throw new Error('Unable to resolve repository owner/name')
  }

  const github = new GitHubClient({
    token,
    owner,
    repo,
    dryRun,
  })

  const pr = await getPullRequestMetadata(github, workflowRun)

  if (!pr?.number) {
    console.log(
      `No pull request found for workflow run ${workflowRun.id}, skipping`
    )
    return
  }

  if (workflowRun.name === 'Generate Stats') {
    await handleStatsWorkflow({ github, workflowRun, pr })
    return
  }

  if (workflowRun.name === 'build-and-test') {
    await handleBuildAndTestWorkflow({ github, workflowRun, pr, owner, repo })
    return
  }

  console.log(`Ignoring workflow "${workflowRun.name}"`)
}

async function getPullRequestMetadata(github, workflowRun) {
  const fromArtifact = await readPullRequestMetadataArtifact()
  if (fromArtifact?.number) {
    const metadata = await validatePullRequestMetadata(
      github,
      workflowRun,
      fromArtifact,
      'PR metadata artifact'
    )
    if (metadata) {
      return metadata
    }
  }

  const fromPayload = workflowRun.pull_requests?.[0]
  if (fromPayload?.number) {
    const metadata = await validatePullRequestMetadata(
      github,
      workflowRun,
      {
        number: fromPayload.number,
        headSha: fromPayload.head?.sha || workflowRun.head_sha,
        headRef: fromPayload.head?.ref || workflowRun.head_branch,
        headRepo: fromPayload.head?.repo?.full_name,
        baseRef: fromPayload.base?.ref,
      },
      'workflow_run payload'
    )
    if (metadata) {
      return metadata
    }
  }

  if (workflowRun.head_sha && github.token) {
    const pull = await github.findPullRequestForCommit(workflowRun.head_sha)
    if (pull?.number) {
      return validatePullRequestMetadata(
        github,
        workflowRun,
        {
          number: pull.number,
          headSha: workflowRun.head_sha,
          headRef: workflowRun.head_branch,
          headRepo: workflowRun.head_repository?.full_name,
          baseRef: pull.base?.ref,
        },
        'commit-associated PR'
      )
    }
  }

  return null
}

async function validatePullRequestMetadata(
  github,
  workflowRun,
  candidate,
  source
) {
  if (!candidate?.number) {
    return null
  }

  if (!github.token) {
    return candidate
  }

  try {
    const pull = await github.getPullRequest(candidate.number)
    const expectedHeadSha = candidate.headSha || workflowRun.head_sha
    if (!expectedHeadSha) {
      console.log(
        `Ignoring ${source} for #${candidate.number}: missing workflow head SHA`
      )
      return null
    }

    if (pull.head?.sha !== expectedHeadSha) {
      console.log(
        `Ignoring ${source} for #${candidate.number}: current PR head ${pull.head?.sha} did not match workflow head ${expectedHeadSha}`
      )
      return null
    }

    if (!candidateMatchesWorkflowRun(candidate, workflowRun)) {
      console.log(
        `Ignoring ${source} for #${candidate.number}: metadata did not match workflow run`
      )
      return null
    }

    return {
      number: pull.number,
      headSha: pull.head?.sha || expectedHeadSha,
      headRef: pull.head?.ref || candidate.headRef || workflowRun.head_branch,
      headRepo: pull.head?.repo?.full_name || candidate.headRepo,
      baseRef: pull.base?.ref || candidate.baseRef,
      isFork: pull.head?.repo?.full_name !== pull.base?.repo?.full_name,
    }
  } catch (err) {
    console.log(`Failed to validate ${source}`, err)
    return null
  }
}

function candidateMatchesWorkflowRun(candidate, workflowRun) {
  if (candidate.headSha && candidate.headSha === workflowRun.head_sha) {
    return true
  }

  const workflowHeadRepo = workflowRun.head_repository?.full_name
  return Boolean(
    candidate.headRef &&
      candidate.headRepo &&
      workflowRun.head_branch &&
      workflowHeadRepo &&
      candidate.headRef === workflowRun.head_branch &&
      candidate.headRepo === workflowHeadRepo
  )
}

async function readPullRequestMetadataArtifact() {
  const metadataPath =
    process.env.PR_CI_METADATA_PATH || path.join('pr-ci-metadata', 'pr.json')

  if (!existsSync(metadataPath)) {
    return null
  }

  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  return {
    number: Number(metadata.number),
    headSha: metadata.headSha,
    headRef: metadata.headRef,
    headRepo: metadata.headRepo,
    baseRef: metadata.baseRef,
    isFork: metadata.isFork === true || metadata.isFork === 'true',
  }
}

async function handleStatsWorkflow({ github, workflowRun, pr }) {
  if (workflowRun.conclusion === 'cancelled') {
    console.log('Stats workflow was cancelled, skipping')
    return
  }

  const jobs = await github.listJobsForRunAttempt(
    workflowRun.id,
    workflowRun.run_attempt || 1
  )
  const candidates = jobs.filter((job) => /aggregate stats/i.test(job.name))

  for (const job of candidates) {
    const logs = await github.downloadJobLogs(job.id)
    const stats = extractDelimitedBlock(
      logs,
      '--stats start--',
      '--stats end--'
    )

    if (!stats) {
      continue
    }

    let body = stats
      .replace('âš ï¸', '\u26a0\ufe0f')
      .replace('âœ“', '\u2713')
      .trim()

    if (!body.includes(STATS_COMMENT_MARKER)) {
      body = `${STATS_COMMENT_MARKER}\n${body}`
    }

    body += `\n\nCommit: ${pr.headSha || workflowRun.head_sha}`

    await github.upsertIssueComment(pr.number, STATS_COMMENT_MARKER, body, [
      '## Stats from current PR',
    ])
    return
  }

  console.log('No stats block found in the completed stats workflow')
}

async function handleBuildAndTestWorkflow({
  github,
  workflowRun,
  pr,
  owner,
  repo,
}) {
  if (workflowRun.conclusion === 'cancelled') {
    console.log('build-and-test was cancelled, skipping')
    return
  }

  if (workflowRun.conclusion === 'success') {
    const body = [
      TEST_COMMENT_MARKER,
      '## Tests Passed',
      '',
      '<!-- ## Failing test suites -->',
      `Commit: ${pr.headSha || workflowRun.head_sha}`,
      '',
    ].join('\n')

    await github.upsertIssueComment(pr.number, TEST_COMMENT_MARKER, body, [
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

    const parsedSuites = parseFailedSuitesFromLogs(logs, job, {
      owner,
      repo,
      sha: pr.headSha || workflowRun.head_sha,
    })

    if (parsedSuites.length === 0) {
      otherFailures.push({ job })
    } else {
      failedSuites.push(...parsedSuites)
    }
  })

  const body = buildTestReportComment({
    failedSuites,
    otherFailures,
    sha: pr.headSha || workflowRun.head_sha,
  })

  await github.upsertIssueComment(pr.number, TEST_COMMENT_MARKER, body, [
    '## Failing test suites',
    '## Failing CI jobs',
  ])
}

function parseFailedSuitesFromLogs(logs, job, { owner, repo, sha }) {
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
        owner,
        repo,
        sha,
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

function extractDelimitedBlock(logs, start, end) {
  const startIndex = logs.indexOf(start)
  if (startIndex === -1) {
    return null
  }

  const contentStart = startIndex + start.length
  const endIndex = logs.indexOf(end, contentStart)
  if (endIndex === -1) {
    return null
  }

  return logs.slice(contentStart, endIndex).trim()
}

function buildTestReportComment({ failedSuites, otherFailures, sha }) {
  const heading =
    failedSuites.length > 0 ? '## Failing test suites' : '## Failing CI jobs'
  const lines = [
    TEST_COMMENT_MARKER,
    heading,
    '',
    `Commit: ${sha} | [About building and testing Next.js](${CONTRIBUTING_URL})`,
    '',
  ]

  for (const suite of failedSuites.sort((a, b) =>
    `${a.job.name}:${a.testPath}`.localeCompare(`${b.job.name}:${b.testPath}`)
  )) {
    const jobMarker = getJobMarker(suite.job.name)
    lines.push(jobMarker.start)
    lines.push(
      `\`${getTestCommand(suite)}\`${getJobTags(suite.job.name)} ([job](${suite.job.html_url}))`
    )

    const sortedGroups = [...suite.groups.keys()].sort()
    for (const group of sortedGroups) {
      const fails = suite.groups.get(group)
      lines.push(
        `- ${fails
          .map((fail) => formatFailureLine(suite, group, fail))
          .join('\n- ')}`
      )
    }

    if (suite.resultMessage) {
      lines.push('')
      lines.push('<details>')
      lines.push('<summary>Expand output</summary>')
      lines.push('')
      lines.push(suite.resultMessage)
      lines.push('</details>')
    }

    lines.push(jobMarker.end)
    lines.push('')
  }

  if (otherFailures.length > 0) {
    if (failedSuites.length > 0) {
      lines.push('### Other failing CI jobs')
      lines.push('')
    }

    for (const { job, reason } of otherFailures.sort((a, b) =>
      a.job.name.localeCompare(b.job.name)
    )) {
      lines.push(
        `- [${job.name}](${job.html_url})${reason ? `: ${reason}` : ''}`
      )
    }
  }

  return lines.join('\n')
}

function formatFailureLine(suite, group, fail) {
  const testName = `${group ? `${group} > ` : ''}${fail.title}`
  const jobName = suite.job.name.toLowerCase()
  if (jobName.includes('rspack')) {
    return testName
  }

  const query = datadogSearchQuery({
    '@git.repository.id': `github.com/${suite.owner}/${suite.repo}`,
    '@git.commit.head_sha': suite.sha,
    '@test.name': testName.replace(/ > /g, ' '),
    '@test.type': jobName.includes('turbopack') ? 'turbopack' : 'nextjs',
    '@test.status': 'fail',
  })
  const linkUrl = new URL('https://app.datadoghq.com/ci/test/runs')
  linkUrl.searchParams.set('query', query)
  return `${testName} ([DD](${linkUrl.href}))`
}

function datadogSearchQuery(values) {
  return Object.entries(values)
    .map(([key, value]) => {
      const escapedValue = value.replace(/"/g, '\\"')
      return `${key}:"${escapedValue}"`
    })
    .join(' ')
}

function getTestCommand(suite) {
  const jobName = suite.job.name.toLowerCase()
  const isTurbopack = jobName.includes('turbopack')
  const isRspack = jobName.includes('rspack')
  const isExperimental = jobName.includes('experimental')
  const isPPR = jobName.includes('ppr')
  const script = suite.mode
    ? `test-${suite.mode}${isExperimental ? '-experimental' : ''}${
        isTurbopack ? '-turbo' : isRspack ? '-rspack' : ''
      }`
    : 'test'
  const commandPrefix = isPPR ? '__NEXT_EXPERIMENTAL_PPR=true ' : ''

  return `${commandPrefix}pnpm ${script} ${suite.testPath}`
}

function getJobTags(jobName) {
  const lowerJobName = jobName.toLowerCase()
  let tags = ''

  if (lowerJobName.includes('turbopack')) {
    tags += ' (turbopack)'
  } else if (lowerJobName.includes('rspack')) {
    tags += ' (rspack)'
  }

  if (lowerJobName.includes('experimental')) {
    tags += ' (Experimental)'
  } else if (lowerJobName.includes('ppr')) {
    tags += ' (PPR)'
  }

  return tags
}

function getJobMarker(jobName) {
  const safeName = jobName.replaceAll('-->', '')
  return {
    start: `<!-- J"${safeName}" -->`,
    end: `<!-- /J"${safeName}" -->`,
  }
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
