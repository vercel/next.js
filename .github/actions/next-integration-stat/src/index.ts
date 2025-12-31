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
const STALE_MARKER = `<!-- __stale__ -->`

// =============================================================================
// Mark Stale Mode
// =============================================================================

async function runMarkStale() {
  const token = getInput('token')
  const octokit = getOctokit(token)

  const prNumber = context?.payload?.pull_request?.number
  const sha = context?.sha
  const shortSha = sha?.substring(0, 7)

  if (!prNumber) {
    console.log('No PR number found, skipping staleness marker')
    return
  }

  console.log(`Marking test results as stale for PR #${prNumber}`)

  // Find existing bot comments
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...context.repo,
    issue_number: prNumber,
    per_page: 200,
  })

  const existingComments = comments?.filter(
    (comment) =>
      comment?.user?.login === 'github-actions[bot]' &&
      comment?.body?.includes(BOT_COMMENT_MARKER) &&
      !comment?.body?.includes(STALE_MARKER) // Don't re-mark already stale comments
  )

  if (!existingComments?.length) {
    console.log('No existing test comments found to mark as stale')
    return
  }

  const runId = context.runId
  const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${runId}`

  for (const comment of existingComments) {
    // Prepend staleness banner to the comment
    const staleBanner = `> ⏳ **Results may be outdated** — Tests are running for commit [\`${shortSha}\`](${runUrl})\n>\n> The results below are from a previous run.\n\n${STALE_MARKER}\n\n`

    const updatedBody = staleBanner + comment.body

    await octokit.rest.issues.updateComment({
      ...context.repo,
      comment_id: comment.id,
      body: updatedBody,
    })

    console.log(`Marked comment ${comment.id} as stale`)
  }
}

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
  retryInfo?: {
    attempts: number
    failedAttempts: number
    passedOnRetry: boolean
  }
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
// Datadog Flaky Test Detection
// =============================================================================

interface DatadogFlakyData {
  testName: string
  isKnownFlaky: boolean
  flakeRate: number // 0-100
  recentFailures: number
  recentRuns: number
}

async function queryDatadogFlakyTests(
  testNames: string[],
  apiKey: string,
  appKey: string
): Promise<Map<string, DatadogFlakyData>> {
  const flakyData = new Map<string, DatadogFlakyData>()

  if (!apiKey || !appKey) {
    console.log('Datadog keys not provided, skipping flaky test detection')
    return flakyData
  }

  console.log(`Querying Datadog for ${testNames.length} tests...`)

  try {
    // Query Datadog CI Visibility API for test events from the last 30 days
    // We look for tests that have both passed and failed recently
    const now = Math.floor(Date.now() / 1000)
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60

    // Build the query for all test names
    // We need to batch this as URLs have length limits
    const batchSize = 10
    for (let i = 0; i < testNames.length; i += batchSize) {
      const batch = testNames.slice(i, i + batchSize)

      for (const testName of batch) {
        try {
          // Normalize test name for query
          const normalizedName = testName
            .replace(/^.*?(test\/)/, 'test/')
            .replace(/^.*?(packages\/)/, 'packages/')

          // Query for this specific test's results
          const query = encodeURIComponent(
            `@git.repository.id:github.com/vercel/next.js ` +
            `@test.name:"${normalizedName}" ` +
            `@git.branch:canary`
          )

          const response = await fetch(
            `https://api.datadoghq.com/api/v2/ci/tests/events?filter[query]=${query}&filter[from]=${thirtyDaysAgo}s&filter[to]=${now}s&page[limit]=100`,
            {
              headers: {
                'DD-API-KEY': apiKey,
                'DD-APPLICATION-KEY': appKey,
                'Content-Type': 'application/json',
              },
            }
          )

          if (!response.ok) {
            console.log(`Datadog API error for ${normalizedName}: ${response.status}`)
            continue
          }

          const data = await response.json()
          const events = data.data || []

          if (events.length === 0) continue

          // Count passes and failures
          let passes = 0
          let failures = 0
          let isKnownFlaky = false

          for (const event of events) {
            const status = event.attributes?.test?.status
            const tags = event.attributes?.tags || []

            if (status === 'pass') passes++
            if (status === 'fail') failures++

            // Check for flaky tags
            if (tags.includes('is_flaky:true') || tags.includes('is_known_flaky:true')) {
              isKnownFlaky = true
            }
          }

          const totalRuns = passes + failures
          if (totalRuns > 0) {
            const flakeRate = totalRuns > 1 && passes > 0 && failures > 0
              ? Math.round((Math.min(passes, failures) / totalRuns) * 100)
              : 0

            // Consider it flaky if it has both passes and failures, or is tagged as flaky
            if (isKnownFlaky || (passes > 0 && failures > 0 && flakeRate >= 10)) {
              flakyData.set(testName, {
                testName,
                isKnownFlaky: isKnownFlaky || flakeRate >= 30,
                flakeRate,
                recentFailures: failures,
                recentRuns: totalRuns,
              })
            }
          }
        } catch (err) {
          console.log(`Error querying Datadog for test: ${err}`)
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < testNames.length) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    console.log(`Found ${flakyData.size} known flaky tests`)
  } catch (err) {
    console.log('Error querying Datadog:', err)
  }

  return flakyData
}

function formatFlakyTestsSection(
  flakyTests: CategorizedTest[],
  flakyData: Map<string, DatadogFlakyData>,
  sha: string
): string {
  if (flakyTests.length === 0) return ''

  let content = `\n---\n\n### Known Flaky Tests (can likely ignore)\n\n`
  content += `> These tests have a history of flaky behavior on \`canary\`. They may not be caused by your changes.\n\n`

  content += `<details>\n`
  content += `<summary>${flakyTests.length} known flaky test${flakyTests.length > 1 ? 's' : ''}</summary>\n\n`

  content += `| Test | Flake Rate | Recent (30d) | Links |\n|------|-----------|--------------|-------|\n`

  for (const test of flakyTests) {
    const shortPath = test.testPath
      .replace(/^.*?(test\/)/, 'test/')
      .replace(/^.*?(packages\/)/, 'packages/')
    const testType = test.category.bundler === 'turbopack' ? 'turbopack' : 'nextjs'
    const ddLink = createDatadogLink(sha, test.name, testType)

    const data = flakyData.get(test.testPath) || flakyData.get(test.name)
    const flakeRate = data?.flakeRate ?? '?'
    const recentStats = data ? `${data.recentFailures}/${data.recentRuns} failed` : '-'

    // Truncate long names
    const displayName = shortPath.length > 50 ? shortPath.substring(0, 47) + '...' : shortPath
    content += `| \`${displayName}\` | ${flakeRate}% | ${recentStats} | [DD](${ddLink}) [job](${test.jobUrl}) |\n`
  }

  content += `\n</details>\n`

  return content
}

// =============================================================================
// Cross-PR Failure Detection
// =============================================================================

interface CrossPRFailure {
  testPath: string
  prNumbers: number[]
}

async function fetchOtherPRFailures(
  octokit: Octokit,
  currentPRNumber: number
): Promise<Map<string, number[]>> {
  // Map of test path -> PR numbers where it's failing
  const failureMap = new Map<string, number[]>()

  try {
    // Get recent open PRs (excluding current)
    const { data: pulls } = await octokit.rest.pulls.list({
      ...context.repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 20,
    })

    const otherPRs = pulls.filter((pr) => pr.number !== currentPRNumber).slice(0, 10)

    console.log(`Checking ${otherPRs.length} other PRs for common failures`)

    for (const pr of otherPRs) {
      try {
        // Get comments for this PR
        const comments = await octokit.paginate(octokit.rest.issues.listComments, {
          ...context.repo,
          issue_number: pr.number,
          per_page: 100,
        })

        // Find bot test result comments
        const testComments = comments.filter(
          (comment) =>
            comment?.user?.login === 'github-actions[bot]' &&
            comment?.body?.includes(BOT_COMMENT_MARKER) &&
            comment?.body?.includes('Failing test suites')
        )

        if (testComments.length === 0) continue

        // Get the most recent test comment
        const latestComment = testComments[testComments.length - 1]
        const body = latestComment.body || ''

        // Parse failing test paths from the comment
        // Look for patterns like: #### `test/e2e/app-dir/...` or pnpm test <path>
        const testPathMatches = body.matchAll(/#### `([^`]+)`/g)
        for (const match of testPathMatches) {
          const testPath = match[1]
          if (!failureMap.has(testPath)) {
            failureMap.set(testPath, [])
          }
          if (!failureMap.get(testPath)!.includes(pr.number)) {
            failureMap.get(testPath)!.push(pr.number)
          }
        }

        // Also look for pnpm test patterns
        const pnpmMatches = body.matchAll(/pnpm test ([^\s\n`]+)/g)
        for (const match of pnpmMatches) {
          const testPath = match[1]
          if (!failureMap.has(testPath)) {
            failureMap.set(testPath, [])
          }
          if (!failureMap.get(testPath)!.includes(pr.number)) {
            failureMap.get(testPath)!.push(pr.number)
          }
        }
      } catch (err) {
        console.log(`Failed to fetch comments for PR #${pr.number}:`, err)
      }
    }
  } catch (err) {
    console.log('Failed to fetch other PRs:', err)
  }

  return failureMap
}

function findCommonFailures(
  currentFailures: string[],
  otherPRFailures: Map<string, number[]>
): CrossPRFailure[] {
  const commonFailures: CrossPRFailure[] = []

  for (const testPath of currentFailures) {
    // Normalize the test path for comparison
    const normalizedPath = testPath
      .replace(/^.*?(test\/)/, 'test/')
      .replace(/^.*?(packages\/)/, 'packages/')

    // Check if this test is failing in other PRs
    for (const [otherPath, prNumbers] of otherPRFailures) {
      const normalizedOtherPath = otherPath
        .replace(/^.*?(test\/)/, 'test/')
        .replace(/^.*?(packages\/)/, 'packages/')

      if (normalizedPath === normalizedOtherPath && prNumbers.length > 0) {
        commonFailures.push({
          testPath: normalizedPath,
          prNumbers,
        })
        break
      }
    }
  }

  return commonFailures
}

function formatCrossPRAlert(
  commonFailures: CrossPRFailure[],
  repoOwner: string,
  repoName: string
): string {
  if (commonFailures.length === 0) return ''

  // Get unique PR numbers
  const allPRNumbers = new Set<number>()
  for (const failure of commonFailures) {
    for (const prNum of failure.prNumbers) {
      allPRNumbers.add(prNum)
    }
  }

  const prLinks = Array.from(allPRNumbers)
    .slice(0, 5)
    .map((num) => `[#${num}](https://github.com/${repoOwner}/${repoName}/pull/${num})`)
    .join(', ')

  const moreCount = allPRNumbers.size > 5 ? ` and ${allPRNumbers.size - 5} more` : ''

  let alert = `\n> ⚠️ **Cross-PR Alert:** ${commonFailures.length} of these failures also occur on ${prLinks}${moreCount}\n`

  if (allPRNumbers.size >= 3) {
    alert += `> This may indicate an infrastructure issue rather than a problem with your changes.\n`
  }

  alert += `\n`

  return alert
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
  passedOnRetryCount: number,
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
  summary += `| Failed Tests | ${totalFailures} |\n`
  if (passedOnRetryCount > 0) {
    summary += `| Passed on Retry | ${passedOnRetryCount} (likely flaky) |\n`
  }

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

function formatSummaryTableWithFlaky(
  sha: string,
  runId: number,
  runAttempt: number,
  totalFailures: number,
  needsInvestigationCount: number,
  knownFlakyCount: number,
  passedOnRetryCount: number,
  investigationGroups: TestGroup[]
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

  // Summary counts with flaky breakdown
  summary += `| Summary | |\n|---------|---|\n`
  summary += `| Total Failed | ${totalFailures} |\n`

  if (knownFlakyCount > 0) {
    summary += `| **Needs Investigation** | **${needsInvestigationCount}** |\n`
    summary += `| Known Flaky | ${knownFlakyCount} (can likely ignore) |\n`
  }

  if (passedOnRetryCount > 0) {
    summary += `| Passed on Retry | ${passedOnRetryCount} (likely flaky) |\n`
  }

  // Group counts by category (only for needs investigation)
  if (investigationGroups.length > 0) {
    summary += `\n| Breakdown | |\n|---------|---|\n`
    const categoryGroups = new Map<string, number>()
    for (const group of investigationGroups) {
      const label = formatCategoryLabel(group.category)
      categoryGroups.set(label, (categoryGroups.get(label) || 0) + group.tests.length)
    }

    for (const [label, count] of categoryGroups) {
      summary += `| ${label} | ${count} |\n`
    }
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

function formatPassedOnRetrySection(tests: CategorizedTest[], sha: string): string {
  if (tests.length === 0) return ''

  let content = `\n---\n\n`
  content += `### Passed on Retry (likely flaky)\n\n`
  content += `> These tests failed initially but passed on retry. They may be flaky.\n\n`

  content += `<details>\n`
  content += `<summary>${tests.length} test${tests.length > 1 ? 's' : ''} passed on retry</summary>\n\n`

  content += `| Test | Attempts | Links |\n|------|----------|-------|\n`

  for (const test of tests) {
    const shortPath = test.testPath.replace(/^.*?(test\/)/, 'test/').replace(/^.*?(packages\/)/, 'packages/')
    const testType = test.category.bundler === 'turbopack' ? 'turbopack' : 'nextjs'
    const ddLink = createDatadogLink(sha, test.name, testType)
    const retryInfo = test.retryInfo
      ? `${retryInfo?.failedAttempts}/${retryInfo?.attempts} ❌→✅`
      : '❌→✅'

    // Truncate long names
    const displayName = shortPath.length > 60 ? shortPath.substring(0, 57) + '...' : shortPath
    content += `| \`${displayName}\` | ${retryInfo} | [DD](${ddLink}) [job](${test.jobUrl}) |\n`
  }

  content += `\n</details>\n`

  return content
}

function formatReproductionCommands(failedTestPaths: string[]): string {
  if (failedTestPaths.length === 0) return ''

  // Normalize paths
  const normalizedPaths = failedTestPaths.map((p) =>
    p.replace(/^.*?(test\/)/, 'test/').replace(/^.*?(packages\/)/, 'packages/')
  )

  // Deduplicate
  const uniquePaths = [...new Set(normalizedPaths)]

  let content = `\n---\n\n### Reproduce locally\n\n`

  // Group by test type
  const e2eTests = uniquePaths.filter((p) => p.includes('test/e2e'))
  const devTests = uniquePaths.filter((p) => p.includes('test/development'))
  const prodTests = uniquePaths.filter((p) => p.includes('test/production'))
  const integrationTests = uniquePaths.filter((p) => p.includes('test/integration'))
  const packageTests = uniquePaths.filter((p) => p.includes('packages/'))
  const otherTests = uniquePaths.filter(
    (p) =>
      !p.includes('test/e2e') &&
      !p.includes('test/development') &&
      !p.includes('test/production') &&
      !p.includes('test/integration') &&
      !p.includes('packages/')
  )

  content += `<details>\n<summary>Copy commands (${uniquePaths.length} tests)</summary>\n\n`

  if (uniquePaths.length <= 10) {
    content += `**Run all failing tests:**\n`
    content += `\`\`\`bash\npnpm test ${uniquePaths.join(' ')}\n\`\`\`\n\n`
  }

  // Individual test commands
  if (e2eTests.length > 0) {
    content += `**E2E tests (${e2eTests.length}):**\n\`\`\`bash\n`
    for (const p of e2eTests.slice(0, 15)) {
      content += `pnpm test ${p}\n`
    }
    if (e2eTests.length > 15) {
      content += `# ... and ${e2eTests.length - 15} more e2e tests\n`
    }
    content += `\`\`\`\n\n`
  }

  if (devTests.length > 0) {
    content += `**Development tests (${devTests.length}):**\n\`\`\`bash\n`
    for (const p of devTests.slice(0, 15)) {
      content += `pnpm test ${p}\n`
    }
    if (devTests.length > 15) {
      content += `# ... and ${devTests.length - 15} more development tests\n`
    }
    content += `\`\`\`\n\n`
  }

  if (prodTests.length > 0) {
    content += `**Production tests (${prodTests.length}):**\n\`\`\`bash\n`
    for (const p of prodTests.slice(0, 15)) {
      content += `pnpm test ${p}\n`
    }
    if (prodTests.length > 15) {
      content += `# ... and ${prodTests.length - 15} more production tests\n`
    }
    content += `\`\`\`\n\n`
  }

  if (integrationTests.length > 0) {
    content += `**Integration tests (${integrationTests.length}):**\n\`\`\`bash\n`
    for (const p of integrationTests.slice(0, 15)) {
      content += `pnpm test ${p}\n`
    }
    if (integrationTests.length > 15) {
      content += `# ... and ${integrationTests.length - 15} more integration tests\n`
    }
    content += `\`\`\`\n\n`
  }

  if (packageTests.length > 0) {
    content += `**Package tests (${packageTests.length}):**\n\`\`\`bash\n`
    for (const p of packageTests.slice(0, 15)) {
      content += `pnpm test ${p}\n`
    }
    if (packageTests.length > 15) {
      content += `# ... and ${packageTests.length - 15} more package tests\n`
    }
    content += `\`\`\`\n\n`
  }

  if (otherTests.length > 0) {
    content += `**Other tests (${otherTests.length}):**\n\`\`\`bash\n`
    for (const p of otherTests.slice(0, 10)) {
      content += `pnpm test ${p}\n`
    }
    if (otherTests.length > 10) {
      content += `# ... and ${otherTests.length - 10} more tests\n`
    }
    content += `\`\`\`\n\n`
  }

  content += `</details>\n`

  return content
}

function formatFooter(): string {
  return `\n---\n\n` +
    `<sub>` +
    `[Testing docs](https://github.com/vercel/next.js/blob/canary/contributing/core/testing.md) · ` +
    `[About this comment](https://github.com/vercel/next.js/tree/canary/.github/actions/next-integration-stat)` +
    `</sub>\n`
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

interface TestAttempt {
  status: 'passed' | 'failed'
  jobName: string
  jobUrl: string
  errorOutput: string
  failedAssertions: Array<{
    ancestorTitles: string[]
    title: string
    fullName: string
  }>
  duration?: number
}

function processTestResults(
  jobResults: Array<JobResult & { jobUrl?: string }>,
  sha: string
): {
  categorizedTests: CategorizedTest[]
  groups: TestGroup[]
  passedOnRetry: CategorizedTest[]
} {
  // First pass: collect all attempts for each test
  const testAttempts = new Map<string, TestAttempt[]>()

  for (const result of jobResults) {
    const { job: jobName, data: testData, jobUrl = '' } = result

    for (const testResult of testData.testResults ?? []) {
      const testKey = testResult.name

      if (!testAttempts.has(testKey)) {
        testAttempts.set(testKey, [])
      }

      const failedAssertions = (testResult.assertionResults ?? [])
        .filter((a) => a.status === 'failed')
        .map((a) => ({
          ancestorTitles: a.ancestorTitles || [],
          title: a.title,
          fullName: a.fullName,
        }))

      testAttempts.get(testKey)!.push({
        status: testResult.status === 'passed' ? 'passed' : 'failed',
        jobName,
        jobUrl,
        errorOutput: stripAnsi(testResult.message || ''),
        failedAssertions,
        duration: testResult.endTime && testResult.startTime
          ? testResult.endTime - testResult.startTime
          : undefined,
      })
    }
  }

  // Second pass: categorize tests based on their final status and retry history
  const categorizedTests: CategorizedTest[] = []
  const passedOnRetry: CategorizedTest[] = []

  for (const [testName, attempts] of testAttempts) {
    const failedAttempts = attempts.filter((a) => a.status === 'failed')
    const passedAttempts = attempts.filter((a) => a.status === 'passed')

    // Test passed on retry: had failures but eventually passed
    if (failedAttempts.length > 0 && passedAttempts.length > 0) {
      const lastFailedAttempt = failedAttempts[failedAttempts.length - 1]
      const category = categorizeTest(testName, lastFailedAttempt.jobName)

      passedOnRetry.push({
        name: testName,
        testPath: testName,
        jobName: lastFailedAttempt.jobName,
        jobUrl: lastFailedAttempt.jobUrl,
        category,
        failedAssertions: lastFailedAttempt.failedAssertions.length > 0
          ? lastFailedAttempt.failedAssertions
          : [{ ancestorTitles: [], title: testName, fullName: testName }],
        errorOutput: lastFailedAttempt.errorOutput,
        duration: lastFailedAttempt.duration,
        retryInfo: {
          attempts: attempts.length,
          failedAttempts: failedAttempts.length,
          passedOnRetry: true,
        },
      })
      continue
    }

    // Test ultimately failed (no successful attempts)
    if (failedAttempts.length > 0 && passedAttempts.length === 0) {
      const lastAttempt = failedAttempts[failedAttempts.length - 1]
      const category = categorizeTest(testName, lastAttempt.jobName)

      categorizedTests.push({
        name: testName,
        testPath: testName,
        jobName: lastAttempt.jobName,
        jobUrl: lastAttempt.jobUrl,
        category,
        failedAssertions: lastAttempt.failedAssertions.length > 0
          ? lastAttempt.failedAssertions
          : [{ ancestorTitles: [], title: testName, fullName: testName }],
        errorOutput: lastAttempt.errorOutput,
        duration: lastAttempt.duration,
        retryInfo: {
          attempts: attempts.length,
          failedAttempts: failedAttempts.length,
          passedOnRetry: false,
        },
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
    passedOnRetry,
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
  const { categorizedTests, groups, passedOnRetry } = processTestResults(
    jobResults.result as Array<JobResult & { jobUrl?: string }>,
    sha
  )

  const totalFailures = groups.reduce((sum, g) => sum + g.tests.length, 0)
  const runId = context.runId
  const runAttempt = parseInt(process.env.GITHUB_RUN_ATTEMPT || '1', 10)

  // Query Datadog for flaky test history
  const datadogApiKey = getInput('datadog_api_key')
  const datadogAppKey = getInput('datadog_app_key')
  const flakyData = await queryDatadogFlakyTests(failedTestLists, datadogApiKey, datadogAppKey)

  // Split tests into "needs investigation" vs "known flaky"
  const flakyTests: CategorizedTest[] = []
  const needsInvestigation: CategorizedTest[] = []

  for (const test of categorizedTests) {
    const testFlakyData = flakyData.get(test.testPath) || flakyData.get(test.name)
    if (testFlakyData && testFlakyData.isKnownFlaky) {
      flakyTests.push(test)
    } else {
      needsInvestigation.push(test)
    }
  }

  // Re-group the needs investigation tests
  const investigationGroupMap = new Map<string, TestGroup>()
  for (const test of needsInvestigation) {
    const key = getCategoryKey(test.category)
    if (!investigationGroupMap.has(key)) {
      investigationGroupMap.set(key, {
        key,
        category: test.category,
        tests: [],
        jobUrl: test.jobUrl,
      })
    }
    investigationGroupMap.get(key)!.tests.push(test)
  }
  const investigationGroups = Array.from(investigationGroupMap.values()).sort((a, b) => b.tests.length - a.tests.length)

  // Check for cross-PR failures
  console.log('Checking for cross-PR failures...')
  const otherPRFailures = await fetchOtherPRFailures(octokit, prNumber)
  const commonFailures = findCommonFailures(failedTestLists, otherPRFailures)
  console.log(`Found ${commonFailures.length} tests failing in other PRs`)

  // Build comment with updated summary
  let commentBody = formatSummaryTableWithFlaky(
    sha, runId, runAttempt,
    totalFailures, needsInvestigation.length, flakyTests.length,
    passedOnRetry.length, investigationGroups
  )

  // Add cross-PR alert if applicable
  if (commonFailures.length > 0) {
    commentBody += formatCrossPRAlert(commonFailures, context.repo.owner, context.repo.repo)
  }

  // Show "needs investigation" tests first (these are the important ones)
  if (investigationGroups.length > 0) {
    commentBody += `\n### Needs Investigation\n`
    for (const group of investigationGroups) {
      commentBody += formatTestGroup(group, sha)
    }
  }

  // Show known flaky tests (collapsed, less important)
  commentBody += formatFlakyTestsSection(flakyTests, flakyData, sha)

  // Add passed on retry section
  commentBody += formatPassedOnRetrySection(passedOnRetry, sha)

  commentBody += formatReproductionCommands(failedTestLists)

  // Add footer with help links
  commentBody += formatFooter()

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

// =============================================================================
// Entry Point
// =============================================================================

async function main() {
  const mode = getInput('mode') || 'report'

  if (mode === 'mark-stale') {
    await runMarkStale()
  } else {
    await run()
  }
}

main().catch((error) => {
  console.error('Action failed:', error)
  process.exit(1)
})
