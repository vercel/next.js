// Shared printer for test failure reports. Renders the markdown used by both
// the PR test report comment (`scripts/pr-ci-comment.mjs`) and the GitHub job
// summary (`run-tests.js`), so both read the same way. Callers only provide
// data (commit, test mode, bundler flags, failed case names); all rendering
// decisions live here. Size limits are the caller's responsibility: GitHub
// comments and job summaries have different maximum sizes.

const CONTRIBUTING_URL =
  'https://github.com/vercel/next.js/blob/canary/contributing.md'

function getJobMarker(jobName) {
  const safeName = jobName.replaceAll('-->', '')
  return {
    start: `<!-- J"${safeName}" -->`,
    end: `<!-- /J"${safeName}" -->`,
  }
}

/**
 * @typedef {object} FailedSuite
 * @property {string} testPath Repo-relative path of the test file.
 * @property {string} [mode] `NEXT_TEST_MODE` the suite ran with, e.g. `dev`
 *   or `start`. Without it the command is rendered as plain `pnpm test`.
 * @property {boolean} [isTurbopack]
 * @property {boolean} [isRspack]
 * @property {boolean} [isExperimental]
 * @property {boolean} [isPPR]
 * @property {string} [jobName] Emits HTML comment markers around the suite so
 *   tooling can locate per-job sections.
 * @property {string} [jobUrl] Rendered as a link to the CI job.
 * @property {string[]} failedCases Failed test case names with ancestor
 *   titles joined by ` > `. Rendered as a bullet list with Datadog links.
 * @property {string} [resultMessage] Rendered in a collapsed "Expand output"
 *   section.
 */

// The `pnpm test-*` command that reproduces the suite run.
function buildTestCommand(suite) {
  const script = suite.mode
    ? `test-${suite.mode}${suite.isExperimental ? '-experimental' : ''}${
        suite.isTurbopack ? '-turbo' : suite.isRspack ? '-rspack' : ''
      }`
    : 'test'
  const commandPrefix = suite.isPPR ? '__NEXT_EXPERIMENTAL_PPR=true ' : ''

  return `${commandPrefix}pnpm ${script} ${suite.testPath}`
}

function buildJobTags(suite) {
  let tags = ''

  if (suite.isTurbopack) {
    tags += ' (turbopack)'
  } else if (suite.isRspack) {
    tags += ' (rspack)'
  }

  if (suite.isExperimental) {
    tags += ' (Experimental)'
  } else if (suite.isPPR) {
    tags += ' (PPR)'
  }

  return tags
}

// Link to the Datadog CI test runs of a failed test case, matching how
// `datadog-ci junit upload` tags the runs in CI.
function datadogTestRunUrl({ owner, repo, sha, testName, testType }) {
  const query = Object.entries({
    '@git.repository.id': `github.com/${owner}/${repo}`,
    '@git.commit.head_sha': sha,
    '@test.name': testName,
    '@test.type': testType,
    '@test.status': 'fail',
  })
    .map(([key, value]) => `${key}:"${value.replace(/"/g, '\\"')}"`)
    .join(' ')

  const url = new URL('https://app.datadoghq.com/ci/test/runs')
  url.searchParams.set('query', query)
  return url.href
}

function formatFailureLine(suite, { owner, repo, sha }, testName) {
  // Rspack test runs are not ingested into Datadog.
  if (suite.isRspack || !owner || !repo || !sha) {
    return testName
  }

  const linkUrl = datadogTestRunUrl({
    owner,
    repo,
    sha,
    testName: testName.replace(/ > /g, ' '),
    testType: suite.isTurbopack ? 'turbopack' : 'nextjs',
  })
  return `${testName} ([DD](${linkUrl}))`
}

/**
 * @param {object} options
 * @param {string} [options.marker] Leading HTML comment marker identifying the
 *   report, e.g. for finding an existing PR comment. Omitted from job summaries.
 * @param {string} [options.owner] Repository owner, used for Datadog links.
 * @param {string} [options.repo] Repository name, used for Datadog links.
 * @param {string} [options.sha] The head commit of the run (for pull requests,
 *   the PR head, not the merge commit). Used for the commit line and Datadog
 *   links; both are skipped when absent.
 * @param {FailedSuite[]} options.suites One entry per failing test suite.
 * @param {Array<{ name: string, url: string, reason?: string }>} [options.otherFailures]
 *   Failing CI jobs without parseable test results.
 * @returns {string} The rendered markdown report.
 */
function buildTestReport({
  marker,
  owner,
  repo,
  sha,
  suites,
  otherFailures = [],
}) {
  const heading =
    suites.length > 0 ? '## Failing test suites' : '## Failing CI jobs'
  const lines = []
  if (marker) {
    lines.push(marker)
  }
  lines.push(heading, '')
  if (sha) {
    lines.push(
      `Commit: ${sha} | [About building and testing Next.js](${CONTRIBUTING_URL})`,
      ''
    )
  }

  for (const suite of suites) {
    const jobMarker = suite.jobName ? getJobMarker(suite.jobName) : null
    if (jobMarker) {
      lines.push(jobMarker.start)
    }
    lines.push(
      `\`${buildTestCommand(suite)}\`${buildJobTags(suite)}${
        suite.jobUrl ? ` ([job](${suite.jobUrl}))` : ''
      }`
    )

    for (const testName of suite.failedCases) {
      lines.push(
        `- ${formatFailureLine(suite, { owner, repo, sha }, testName)}`
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

    if (jobMarker) {
      lines.push(jobMarker.end)
    }
    lines.push('')
  }

  if (otherFailures.length > 0) {
    if (suites.length > 0) {
      lines.push('### Other failing CI jobs')
      lines.push('')
    }

    for (const { name, url, reason } of otherFailures) {
      lines.push(`- [${name}](${url})${reason ? `: ${reason}` : ''}`)
    }
  }

  return lines.join('\n')
}

module.exports = { buildTestReport }
