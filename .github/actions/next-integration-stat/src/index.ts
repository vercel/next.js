import { context, getOctokit } from '@actions/github'
import { info, getInput } from '@actions/core'
const { default: stripAnsi } = require('strip-ansi')
const fs = require('fs')

/// <reference path="./manifest" />

type Octokit = ReturnType<typeof getOctokit>

type Job = Awaited<
  ReturnType<Octokit['rest']['actions']['listJobsForWorkflowRun']>
>['data']['jobs'][number]

// A comment marker to identify the comment created by this action.
const BOT_COMMENT_MARKER = `<!-- __marker__ next.js integration stats __marker__ -->`

// =============================================================================
// Test Categorization Helpers
// =============================================================================

interface TestCategory {
  type: 'unit' | 'e2e' | 'integration' | 'development' | 'production' | 'packages' | 'other'
  platform: 'windows' | 'linux'
  bundler: 'turbopack' | 'rspack' | 'webpack'
}

interface CategorizedTest {
  name: string
  testPath: string
  jobName: string
  jobUrl: string
  category: TestCategory
  failedAssertions: Array<{
    ancestorTitles: string[]
    title: string
    fullName: string
  }>
  errorOutput: string
  duration?: number
}

interface TestGroup {
  key: string
  category: TestCategory
  tests: CategorizedTest[]
  jobUrl: string
}

function categorizeTest(testPath: string, jobName: string): TestCategory {
  // Test type from path
  let type: TestCategory['type'] = 'other'
  if (testPath.includes('test/unit') || testPath.includes('packages/')) {
    type = testPath.includes('packages/') ? 'packages' : 'unit'
  } else if (testPath.includes('test/e2e')) {
    type = 'e2e'
  } else if (testPath.includes('test/integration')) {
    type = 'integration'
  } else if (testPath.includes('test/development')) {
    type = 'development'
  } else if (testPath.includes('test/production')) {
    type = 'production'
  }

  // Platform from job name
  const platform: TestCategory['platform'] = jobName.toLowerCase().includes('windows')
    ? 'windows'
    : 'linux'

  // Bundler from job name
  let bundler: TestCategory['bundler'] = 'webpack'
  if (jobName.toLowerCase().includes('turbopack')) {
    bundler = 'turbopack'
  } else if (jobName.toLowerCase().includes('rspack')) {
    bundler = 'rspack'
  }

  return { type, platform, bundler }
}

function getCategoryKey(category: TestCategory): string {
  return `${category.type}-${category.bundler}-${category.platform}`
}

function formatCategoryLabel(category: TestCategory): string {
  return `\`${category.type}\` · \`${category.bundler}\` · \`${category.platform}\``
}

// =============================================================================
// Datadog Link Helpers
// =============================================================================

function createDatadogLink(sha: string, testName: string, testType: string): string {
  const query = encodeURIComponent(
    `@git.repository.id:"github.com/vercel/next.js" ` +
    `@git.commit.head_sha:"${sha}" ` +
    `@test.name:"${testName}" ` +
    `@test.type:"${testType}" ` +
    `@test.status:"fail"`
  )
  return `https://app.datadoghq.com/ci/test/runs?query=${query}`
}

function createTestSourceLink(testPath: string, sha: string): string {
  // Clean up the test path to get relative path
  const relativePath = testPath.replace(/^.*?(test\/)/, 'test/').replace(/^.*?(packages\/)/, 'packages/')
  return `https://github.com/vercel/next.js/blob/${sha}/${relativePath}`
}

// =============================================================================
// Comment Formatting
// =============================================================================

function formatSummaryTable(
  sha: string,
  runId: number,
  runAttempt: number,
  totalFailures: number,
  categorizedGroups: TestGroup[]
): string {
  const commitUrl = `https://github.com/vercel/next.js/commit/${sha}`
  const runUrl = `https://github.com/vercel/next.js/actions/runs/${runId}/attempts/${runAttempt}`
  const rerunUrl = `https://github.com/vercel/next.js/actions/runs/${runId}`
  const shortSha = sha.substring(0, 7)

  let summary = `## Failing test suites ${BOT_COMMENT_MARKER}\n\n`

  // Header with commit info
  summary += `| | |\n|---|---|\n`
  summary += `| **Tested Commit** | [\`${shortSha}\`](${commitUrl}) |\n`
  summary += `| **Workflow Run** | [#${runId}](${runUrl}) · Attempt ${runAttempt} |\n\n`

  summary += `[**Re-run failed jobs →**](${rerunUrl})\n\n`

  summary += `---\n\n`

  // Summary counts
  summary += `| Summary | |\n|---------|---|\n`
  summary += `| Total Failures | ${totalFailures} |\n`

  // Group counts by category
  const categoryGroups = new Map<string, number>()
  for (const group of categorizedGroups) {
    const label = formatCategoryLabel(group.category)
    categoryGroups.set(label, (categoryGroups.get(label) || 0) + group.tests.length)
  }

  for (const [label, count] of categoryGroups) {
    summary += `| ${label} | ${count} |\n`
  }

  return summary
}

function formatTestGroup(group: TestGroup, sha: string): string {
  let content = `\n---\n\n`

  const testsByFile = new Map<string, CategorizedTest[]>()
  for (const test of group.tests) {
    const existing = testsByFile.get(test.testPath) || []
    existing.push(test)
    testsByFile.set(test.testPath, existing)
  }

  content += `<details open>\n`
  content += `<summary>${formatCategoryLabel(group.category)} — ${group.tests.length} test${group.tests.length > 1 ? 's' : ''}</summary>\n\n`

  for (const [testPath, tests] of testsByFile) {
    const shortPath = testPath.replace(/^.*?(test\/)/, 'test/').replace(/^.*?(packages\/)/, 'packages/')

    content += `#### \`${shortPath}\`\n\n`
    content += `\`\`\`bash\npnpm test ${shortPath}\n\`\`\`\n\n`

    // Determine test type for DD link
    const testType = group.category.bundler === 'turbopack' ? 'turbopack' : 'nextjs'

    content += `| Test | Links |\n|------|-------|\n`

    for (const test of tests) {
      for (const assertion of test.failedAssertions) {
        const testName = [...assertion.ancestorTitles, assertion.title].join(' > ')
        const ddLink = createDatadogLink(sha, assertion.fullName, testType)
        const srcLink = createTestSourceLink(testPath, sha)

        // Truncate long test names
        const displayName = testName.length > 80 ? testName.substring(0, 77) + '...' : testName
        content += `| \`${displayName}\` | [DD](${ddLink}) [src](${srcLink}) [job](${test.jobUrl}) |\n`
      }
    }

    content += `\n`

    // Error output (collapsed)
    const combinedOutput = tests
      .map((t) => t.errorOutput)
      .filter(Boolean)
      .join('\n\n')

    if (combinedOutput) {
      const truncatedOutput =
        combinedOutput.length > 10000
          ? combinedOutput.substring(0, 10000) + '\n\n... (truncated)'
          : combinedOutput

      content += `<details>\n<summary>Error output</summary>\n\n\`\`\`\n${truncatedOutput}\n\`\`\`\n\n</details>\n\n`
    }
  }

  content += `</details>\n`

  return content
}

function formatReproductionCommands(failedTestPaths: string[]): string {
  if (failedTestPaths.length === 0) return ''

  let content = `\n---\n\n### Reproduce locally\n\n`

  if (failedTestPaths.length <= 5) {
    content += `\`\`\`bash\n`
    for (const testPath of failedTestPaths) {
      const shortPath = testPath.replace(/^.*?(test\/)/, 'test/').replace(/^.*?(packages\/)/, 'packages/')
      content += `pnpm test ${shortPath}\n`
    }
    content += `\`\`\`\n`
  } else {
    content += `\`\`\`bash\n# Run all failing tests\n`
    content += `pnpm test ${failedTestPaths.slice(0, 3).map(p => p.replace(/^.*?(test\/)/, 'test/').replace(/^.*?(packages\/)/, 'packages/')).join(' ')}\n`
    content += `# ... and ${failedTestPaths.length - 3} more\n\`\`\`\n`
  }

  return content
}

// =============================================================================
// Core Functions (mostly unchanged from original)
// =============================================================================

async function fetchJobLogsFromWorkflow(
  octokit: Octokit,
  job: Job
): Promise<{ logs: string; job: Job }> {
  console.log(
    `fetchJobLogsFromWorkflow ${job.name}: Checking test results for the job`
  )

  const jobLogRedirectResponse =
    await octokit.rest.actions.downloadJobLogsForWorkflowRun({
      accept: 'application/vnd.github.v3+json',
      ...context.repo,
      job_id: job.id,
    })

  console.log(
    `fetchJobLogsFromWorkflow ${job.name}: Trying to get logs from redirect url ${jobLogRedirectResponse.url}`
  )

  const jobLogsResponse = await fetch(jobLogRedirectResponse.url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
  })

  console.log(
    `fetchJobLogsFromWorkflow ${job.name}: Logs response status ${jobLogsResponse.status}`
  )

  if (!jobLogsResponse.ok) {
    throw new Error(
      `Failed to get logsUrl, got status ${jobLogsResponse.status}`
    )
  }

  const logText: string = await jobLogsResponse.text()
  const dateTimeStripped = logText
    .split('\n')
    .map((line) => line.substring('2020-03-02T19:39:16.8832288Z '.length))

  const logs = dateTimeStripped.join('\n')

  return { logs, job }
}

async function getInputs(): Promise<{
  token: string
  octokit: Octokit
  prNumber: number | undefined
  sha: string
  noBaseComparison: boolean
  shouldExpandResultMessages: boolean
}> {
  const token = getInput('token')
  const octokit = getOctokit(token)

  const shouldExpandResultMessages =
    getInput('expand_result_messages') === 'true'

  if (!shouldExpandResultMessages) {
    console.log('Test report comment will not include result messages.')
  }

  const prNumber = context?.payload?.pull_request?.number
  const sha = context?.sha

  const noBaseComparison = prNumber == null

  if (prNumber != null) {
    console.log('Trying to collect integration stats for PR', {
      prNumber,
      sha: sha,
    })

    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      ...context.repo,
      issue_number: prNumber,
      per_page: 200,
    })

    console.log('Found total comments for PR', comments?.length || 0)

    const existingComments = comments?.filter(
      (comment) =>
        comment?.user?.login === 'github-actions[bot]' &&
        comment?.body?.includes(BOT_COMMENT_MARKER)
    )

    if (existingComments?.length) {
      console.log('Found existing comments, deleting them')
      for (const comment of existingComments) {
        await octokit.rest.issues.deleteComment({
          ...context.repo,
          comment_id: comment.id,
        })
      }
    }
  } else {
    info('No PR number found in context, will not try to post comment.')
  }

  const inputs = {
    token,
    octokit,
    prNumber,
    sha,
    noBaseComparison,
    shouldExpandResultMessages,
  }

  console.log('getInputs: these inputs will be used to collect test results', {
    ...inputs,
    token: !!token,
  })

  return inputs
}

async function getJobResults(
  octokit: Octokit,
  token: string,
  sha: string
): Promise<{ manifest: TestResultManifest; jobs: Job[] }> {
  console.log('Trying to collect next.js integration test logs')
  const jobs = await octokit.paginate(
    octokit.rest.actions.listJobsForWorkflowRun,
    {
      ...context.repo,
      run_id: context?.runId,
      per_page: 50,
    }
  )

  const integrationTestJobs = jobs?.filter((job) =>
    /Next\.js integration test \([^)]*\) \([^)]*\)/.test(job.name)
  )

  console.log(
    `Logs found for ${integrationTestJobs.length} jobs`,
    integrationTestJobs.map((job) => job.name)
  )

  const fullJobLogsFromWorkflow = await Promise.all(
    integrationTestJobs.map((job) => fetchJobLogsFromWorkflow(octokit, job))
  )

  console.log('Logs downloaded for all jobs')

  const [jobResults, flakyMonitorJobResults] = fullJobLogsFromWorkflow.reduce(
    (acc, { logs, job }) => {
      const subset = job.name.includes('FLAKY_SUBSET')
      const index = subset ? 1 : 0

      const { id, run_id, run_url, html_url } = job
      console.log('Parsing logs for job', { id, run_id, run_url, html_url })
      const splittedLogs = logs.split('--test output start--')
      splittedLogs.shift()
      for (const logLine of splittedLogs) {
        let testData: string | undefined
        try {
          testData = logLine.split('--test output end--')[0].trim()!

          const data = JSON.parse(testData)
          acc[index].push({
            job: job.name,
            jobUrl: job.html_url || '',
            data,
          })
        } catch (err) {
          console.log('Failed to parse test results', {
            id,
            run_id,
            run_url,
            html_url,
            testData,
          })
        }
      }

      return acc
    },
    [[], []] as [Array<JobResult & { jobUrl: string }>, Array<JobResult & { jobUrl: string }>]
  )

  console.log(`Flakyness test subset results`, { flakyMonitorJobResults })

  const testResultManifest: TestResultManifest = {
    ref: sha,
    flakyMonitorJobResults: flakyMonitorJobResults,
    result: jobResults,
  }

  fs.writeFileSync(
    './nextjs-test-results.json',
    JSON.stringify(testResultManifest, null, 2)
  )

  return { manifest: testResultManifest, jobs: integrationTestJobs }
}

function processTestResults(
  jobResults: Array<JobResult & { jobUrl?: string }>,
  sha: string
): { categorizedTests: CategorizedTest[]; groups: TestGroup[] } {
  const categorizedTests: CategorizedTest[] = []
  const seenTests = new Set<string>()

  for (const result of jobResults) {
    const { job: jobName, data: testData, jobUrl = '' } = result

    for (const testResult of testData.testResults ?? []) {
      if (testResult.status === 'passed') continue

      const testKey = `${testResult.name}-${jobName}`
      if (seenTests.has(testKey)) continue
      seenTests.add(testKey)

      const category = categorizeTest(testResult.name, jobName)

      const failedAssertions = (testResult.assertionResults ?? [])
        .filter((a) => a.status === 'failed')
        .map((a) => ({
          ancestorTitles: a.ancestorTitles || [],
          title: a.title,
          fullName: a.fullName,
        }))

      // If no individual assertions, create one from the test itself
      if (failedAssertions.length === 0) {
        failedAssertions.push({
          ancestorTitles: [],
          title: testResult.name,
          fullName: testResult.name,
        })
      }

      categorizedTests.push({
        name: testResult.name,
        testPath: testResult.name,
        jobName,
        jobUrl,
        category,
        failedAssertions,
        errorOutput: stripAnsi(testResult.message || ''),
        duration: testResult.endTime && testResult.startTime
          ? testResult.endTime - testResult.startTime
          : undefined,
      })
    }
  }

  // Group by category
  const groupMap = new Map<string, TestGroup>()

  for (const test of categorizedTests) {
    const key = getCategoryKey(test.category)

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        category: test.category,
        tests: [],
        jobUrl: test.jobUrl,
      })
    }

    groupMap.get(key)!.tests.push(test)
  }

  return {
    categorizedTests,
    groups: Array.from(groupMap.values()).sort((a, b) => b.tests.length - a.tests.length),
  }
}

async function createCommentAsync(
  octokit: Octokit,
  prNumber: number,
  body: string
) {
  const result = await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: prNumber,
    body,
  })

  console.log('Created a new comment', result.data.html_url)
}

// =============================================================================
// Main
// =============================================================================

async function run() {
  const {
    token,
    octokit,
    prNumber,
    sha,
  } = await getInputs()

  const { manifest: jobResults, jobs } = await getJobResults(octokit, token, sha)

  const failedTestLists: string[] = []
  const passedTestsLists: string[] = []

  // Collect all test paths
  for (const result of jobResults.result) {
    for (const testResult of result.data.testResults ?? []) {
      if (testResult.status !== 'passed') {
        if (!failedTestLists.includes(testResult.name)) {
          failedTestLists.push(testResult.name)
        }
      } else {
        passedTestsLists.push(testResult.name)
      }
    }
  }

  // Write test lists to files
  fs.writeFileSync(
    './failed-test-path-list.json',
    JSON.stringify(failedTestLists.filter((x) => x.length > 5), null, 2)
  )

  fs.writeFileSync(
    './passed-test-path-list.json',
    JSON.stringify(passedTestsLists, null, 2)
  )

  if (!prNumber) {
    console.log('No PR number, skipping comment')
    return
  }

  // No failures - post success message
  if (jobResults.result.length === 0 || failedTestLists.length === 0) {
    console.log('No failed test results found :tada:')
    await createCommentAsync(
      octokit,
      prNumber,
      `## Next.js integration test results ${BOT_COMMENT_MARKER}\n\n` +
      `✅ All tests passed!\n\n` +
      `**Commit:** \`${sha.substring(0, 7)}\``
    )
    return
  }

  // Process and categorize test results
  const { groups } = processTestResults(
    jobResults.result as Array<JobResult & { jobUrl?: string }>,
    sha
  )

  const totalFailures = groups.reduce((sum, g) => sum + g.tests.length, 0)
  const runId = context.runId
  const runAttempt = parseInt(process.env.GITHUB_RUN_ATTEMPT || '1', 10)

  // Build comment
  let commentBody = formatSummaryTable(sha, runId, runAttempt, totalFailures, groups)

  for (const group of groups) {
    commentBody += formatTestGroup(group, sha)
  }

  commentBody += formatReproductionCommands(failedTestLists)

  // Check comment length and truncate if needed
  if (commentBody.length > 65000) {
    console.log('Comment too long, truncating...')
    commentBody = commentBody.substring(0, 64000) +
      '\n\n---\n\n> ⚠️ Comment truncated due to length. See workflow logs for full details.'
  }

  try {
    await createCommentAsync(octokit, prNumber, commentBody)
  } catch (error) {
    console.error('Failed to post comment', error)
    throw error
  }
}

run()
