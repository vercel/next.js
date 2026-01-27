const { execSync } = require('child_process')
const fs = require('fs/promises')
const path = require('path')

const OUTPUT_DIR = path.join(__dirname, 'pr-status')

// ============================================================================
// Helper Functions
// ============================================================================

function exec(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB for large logs
    }).trim()
  } catch (error) {
    console.error(`Command failed: ${cmd}`)
    console.error(error.stderr || error.message)
    throw error
  }
}

function execJson(cmd) {
  const output = exec(cmd)
  return JSON.parse(output)
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return 'N/A'
  const start = new Date(startedAt)
  const end = new Date(completedAt)

  // Validate that both dates are valid (not Invalid Date objects)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'N/A'

  const seconds = Math.floor((end - start) / 1000)

  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatElapsedTime(startedAt) {
  if (!startedAt) return 'N/A'
  const start = new Date(startedAt)
  if (isNaN(start.getTime())) return 'N/A'

  const now = new Date()
  const seconds = Math.floor((now - start) / 1000)

  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

function escapeMarkdownTableCell(text) {
  if (!text) return ''
  // Escape pipe characters and newlines for markdown table cells
  return String(text)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
}

function stripTimestamps(logContent) {
  // Remove GitHub Actions timestamp prefixes like "2026-01-23T10:11:12.8077557Z "
  return logContent.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/gm, '')
}

function isBot(username) {
  if (!username) return false
  return username.endsWith('-bot') || username.endsWith('[bot]')
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

function getBranchInfo(prNumberArg) {
  // If PR number provided as argument, fetch branch from that PR
  if (prNumberArg) {
    try {
      const output = exec(`gh pr view ${prNumberArg} --json number,headRefName`)
      const data = JSON.parse(output)
      if (data.number && data.headRefName) {
        return { prNumber: String(data.number), branchName: data.headRefName }
      }
    } catch {
      console.error(`Failed to fetch PR #${prNumberArg}`)
      process.exit(1)
    }
  }

  // Auto-detect from current branch/PR context
  try {
    const output = exec(`gh pr view --json number,headRefName`)
    const data = JSON.parse(output)
    if (data.number && data.headRefName) {
      return { prNumber: String(data.number), branchName: data.headRefName }
    }
  } catch {
    // Fallback to git if not in PR context
  }
  const branchName = exec('git rev-parse --abbrev-ref HEAD')
  return { prNumber: null, branchName }
}

function getWorkflowRuns(branch) {
  const encodedBranch = encodeURIComponent(branch)
  const jqQuery =
    '.workflow_runs[] | select(.name == "build-and-test") | {id, run_attempt, status, conclusion}'
  const output = exec(
    `gh api "repos/vercel/next.js/actions/runs?branch=${encodedBranch}&per_page=10" --jq '${jqQuery}'`
  )

  if (!output.trim()) return []

  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

function getRunMetadata(runId) {
  return execJson(
    `gh api "repos/vercel/next.js/actions/runs/${runId}" --jq '{id, name, status, conclusion, run_attempt, html_url, head_sha, created_at, updated_at}'`
  )
}

function getFailedJobs(runId) {
  const failedJobs = []
  let page = 1

  while (true) {
    const jqQuery = '.jobs[] | select(.conclusion == "failure") | {id, name}'
    let output
    try {
      output = exec(
        `gh api "repos/vercel/next.js/actions/runs/${runId}/jobs?per_page=100&page=${page}" --jq '${jqQuery}'`
      )
    } catch {
      break
    }

    if (!output.trim()) break

    const jobs = output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))

    failedJobs.push(...jobs)

    if (jobs.length < 100) break
    page++
  }

  return failedJobs
}

function getAllJobs(runId) {
  const allJobs = []
  let page = 1

  while (true) {
    const jqQuery =
      '.jobs[] | {id, name, status, conclusion, started_at, completed_at}'
    let output
    try {
      output = exec(
        `gh api "repos/vercel/next.js/actions/runs/${runId}/jobs?per_page=100&page=${page}" --jq '${jqQuery}'`
      )
    } catch {
      break
    }

    if (!output.trim()) break

    const jobs = output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))

    allJobs.push(...jobs)

    if (jobs.length < 100) break
    page++
  }

  return allJobs
}

function categorizeJobs(jobs) {
  return {
    failed: jobs.filter((j) => j.conclusion === 'failure'),
    inProgress: jobs.filter((j) => j.status === 'in_progress'),
    queued: jobs.filter((j) => j.status === 'queued'),
    succeeded: jobs.filter((j) => j.conclusion === 'success'),
    cancelled: jobs.filter((j) => j.conclusion === 'cancelled'),
    skipped: jobs.filter((j) => j.conclusion === 'skipped'),
  }
}

function getJobMetadata(jobId) {
  return execJson(
    `gh api "repos/vercel/next.js/actions/jobs/${jobId}" --jq '{id, name, status, conclusion, started_at, completed_at, html_url}'`
  )
}

function getJobLogs(jobId) {
  try {
    return exec(`gh api "repos/vercel/next.js/actions/jobs/${jobId}/logs"`)
  } catch {
    return 'Logs not available'
  }
}

function getPRReviews(prNumber) {
  try {
    const reviews = execJson(
      `gh api "repos/vercel/next.js/pulls/${prNumber}/reviews" --jq '[.[] | {id, user: .user.login, state: .state, body: .body, submitted_at: .submitted_at, html_url: .html_url}]'`
    )
    return reviews.filter((r) => !isBot(r.user))
  } catch {
    return []
  }
}

function getPRReviewThreads(prNumber) {
  const query = `
    query {
      repository(owner:"vercel", name:"next.js") {
        pullRequest(number:${prNumber}) {
          reviewThreads(first:100) {
            nodes {
              isResolved
              path
              line
              startLine
              diffSide
              comments(first:50) {
                nodes {
                  id
                  author { login }
                  body
                  createdAt
                  url
                  diffHunk
                }
              }
            }
          }
        }
      }
    }
  `
  try {
    const output = exec(`gh api graphql -f query='${query}'`)
    const data = JSON.parse(output)
    return data.data.repository.pullRequest.reviewThreads.nodes
  } catch {
    return []
  }
}

function getPRComments(prNumber) {
  try {
    const comments = execJson(
      `gh api "repos/vercel/next.js/issues/${prNumber}/comments" --jq '[.[] | {id, user: .user.login, body: .body, created_at: .created_at, html_url: .html_url}]'`
    )
    return comments.filter((c) => !isBot(c.user))
  } catch {
    return []
  }
}

// ============================================================================
// Log Parsing Functions
// ============================================================================

function extractTestOutputJson(logContent) {
  // Extract all --test output start-- {JSON} --test output end-- blocks
  const results = []
  const regex = /--test output start--\s*(\{[\s\S]*?\})\s*--test output end--/g
  let match = regex.exec(logContent)

  while (match !== null) {
    try {
      const json = JSON.parse(match[1])
      results.push(json)
    } catch {
      // Skip invalid JSON
    }
    match = regex.exec(logContent)
  }

  return results
}

function extractTestCaseGroups(logContent) {
  // Extract ##[group]❌ test/... ##[endgroup] blocks
  // Combine multiple retries of the same test into one entry
  const groupsByPath = new Map()
  const regex =
    /##\[group\]❌\s*(test\/[^\s]+)\s+output([\s\S]*?)##\[endgroup\]/g
  let match = regex.exec(logContent)

  while (match !== null) {
    const testPath = match[1]
    const content = stripTimestamps(match[2].trim())

    if (groupsByPath.has(testPath)) {
      // Append retry content with a separator
      const existing = groupsByPath.get(testPath)
      groupsByPath.set(testPath, `${existing}\n\n--- RETRY ---\n\n${content}`)
    } else {
      groupsByPath.set(testPath, content)
    }
    match = regex.exec(logContent)
  }

  const groups = []
  for (const [testPath, content] of groupsByPath) {
    groups.push({ testPath, content })
  }
  return groups
}

function extractSections(logContent) {
  // Split the log into sections at ##[group] and ##[endgroup] boundaries
  const sections = []
  const lines = logContent.split('\n')

  let currentSection = { name: null, startLine: 0 }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check for group start
    const groupMatch = line.match(/##\[group\](.*)/)
    if (groupMatch) {
      // End current section
      const lineCount = i - currentSection.startLine
      if (lineCount > 0 || sections.length === 0) {
        const rawContent = lines.slice(currentSection.startLine, i).join('\n')
        const hasError = rawContent.includes('##[error]')
        const content = stripTimestamps(rawContent.trim())
        sections.push({
          name: currentSection.name,
          lineCount: lineCount,
          content: content,
          hasError: hasError,
        })
      }
      // Start new section with group name
      currentSection = { name: groupMatch[1].trim() || null, startLine: i + 1 }
      continue
    }

    // Check for group end
    if (line.includes('##[endgroup]')) {
      // End current section
      const lineCount = i - currentSection.startLine
      const rawContent = lines.slice(currentSection.startLine, i).join('\n')
      const hasError = rawContent.includes('##[error]')
      const content = stripTimestamps(rawContent.trim())
      sections.push({
        name: currentSection.name,
        lineCount: lineCount,
        content: content,
        hasError: hasError,
      })
      // Start new section with no name
      currentSection = { name: null, startLine: i + 1 }
      continue
    }
  }

  // Add final section if there are remaining lines
  const finalLineCount = lines.length - currentSection.startLine
  if (finalLineCount > 0) {
    const rawContent = lines.slice(currentSection.startLine).join('\n')
    const hasError = rawContent.includes('##[error]')
    const content = stripTimestamps(rawContent.trim())
    sections.push({
      name: currentSection.name,
      lineCount: finalLineCount,
      content: content,
      hasError: hasError,
    })
  }

  return sections
}

// ============================================================================
// Markdown Generation Functions
// ============================================================================

function generateIndexMd(
  branchInfo,
  runMetadata,
  categorizedJobs,
  jobTestCounts,
  reviewData
) {
  const { failed, inProgress, queued, succeeded, cancelled, skipped } =
    categorizedJobs
  const totalJobs =
    failed.length +
    inProgress.length +
    queued.length +
    succeeded.length +
    cancelled.length +
    skipped.length
  const completedJobs =
    failed.length + succeeded.length + cancelled.length + skipped.length

  const isRunComplete = runMetadata.status === 'completed'
  const reportTitle = isRunComplete
    ? '# CI Failures Report'
    : '# CI Status Report'

  const lines = [reportTitle, '', `Branch: ${branchInfo.branchName}`]

  if (branchInfo.prNumber) {
    lines.push(`PR: #${branchInfo.prNumber}`)
  }

  const statusStr = runMetadata.conclusion
    ? `${runMetadata.status}/${runMetadata.conclusion}`
    : runMetadata.status

  lines.push(
    `Run: ${runMetadata.id} (attempt ${runMetadata.run_attempt})`,
    `Status: ${statusStr}`,
    `Time: ${runMetadata.created_at} - ${runMetadata.updated_at || 'ongoing'}`,
    `URL: ${runMetadata.html_url}`,
    ''
  )

  // Progress summary for in-progress runs
  if (!isRunComplete) {
    lines.push(
      '## CI Progress',
      '',
      `**${completedJobs}/${totalJobs}** jobs completed`,
      '',
      '| Status | Count |',
      '|--------|-------|',
      `| Failed | ${failed.length} |`,
      `| In Progress | ${inProgress.length} |`,
      `| Queued | ${queued.length} |`,
      `| Succeeded | ${succeeded.length} |`
    )
    if (cancelled.length > 0) lines.push(`| Cancelled | ${cancelled.length} |`)
    if (skipped.length > 0) lines.push(`| Skipped | ${skipped.length} |`)
    lines.push(
      '',
      '> **Note:** CI is still running. Re-run this script later for updated results.',
      ''
    )
  }

  // Failed jobs section
  if (failed.length > 0) {
    lines.push(
      `## Failed Jobs (${failed.length})`,
      '',
      '| Job | Name | Duration | Tests | File |',
      '|-----|------|----------|-------|------|'
    )

    for (const job of failed) {
      const duration = formatDuration(job.started_at, job.completed_at)
      const testCount = jobTestCounts[job.id]
      const testsStr = testCount
        ? `${testCount.failed}/${testCount.total}`
        : 'N/A'
      lines.push(
        `| ${job.id} | ${escapeMarkdownTableCell(job.name)} | ${duration} | ${testsStr} | [Details](job-${job.id}.md) |`
      )
    }
    lines.push('')
  }

  // In-progress jobs section (only when CI is running)
  if (inProgress.length > 0) {
    lines.push(
      `## In Progress Jobs (${inProgress.length})`,
      '',
      '| Job | Name | Running For |',
      '|-----|------|-------------|'
    )

    for (const job of inProgress) {
      const elapsed = formatElapsedTime(job.started_at)
      lines.push(
        `| ${job.id} | ${escapeMarkdownTableCell(job.name)} | ${elapsed} |`
      )
    }
    lines.push('')
  }

  // Queued jobs section (only when CI is running)
  if (queued.length > 0) {
    lines.push(
      `## Queued Jobs (${queued.length})`,
      '',
      '| Job | Name |',
      '|-----|------|'
    )

    for (const job of queued) {
      lines.push(`| ${job.id} | ${escapeMarkdownTableCell(job.name)} |`)
    }
    lines.push('')
  }

  // Add PR reviews section if we have review data
  if (reviewData) {
    const { reviews, reviewThreads, prComments } = reviewData

    // Filter reviews to only include meaningful ones
    const meaningfulReviews = reviews.filter(
      (r) =>
        r.state === 'APPROVED' ||
        r.state === 'CHANGES_REQUESTED' ||
        r.body?.trim()
    )

    if (meaningfulReviews.length > 0 || prComments.length > 0) {
      lines.push('', `## PR Reviews (${meaningfulReviews.length})`, '')

      if (meaningfulReviews.length > 0) {
        lines.push(
          '| Reviewer | State | Date/Time | Comment |',
          '|----------|-------|-----------|---------|'
        )

        // Sort reviews by date, oldest first
        const sortedReviews = [...meaningfulReviews].sort(
          (a, b) => new Date(a.submitted_at) - new Date(b.submitted_at)
        )

        for (const review of sortedReviews) {
          const time = review.submitted_at
            ? new Date(review.submitted_at)
                .toISOString()
                .replace('T', ' ')
                .substring(0, 19)
            : 'N/A'
          const hasComment = review.body?.trim()
          const commentLink = hasComment ? `[View](review-${review.id}.md)` : ''
          lines.push(
            `| ${escapeMarkdownTableCell(review.user)} | ${review.state} | ${time} | ${commentLink} |`
          )
        }
      }
    }

    if (reviewThreads.length > 0) {
      lines.push(
        '',
        `## Inline Review Comments (${reviewThreads.length} threads)`,
        '',
        '| File | Line | Author | Replies | Status | Details |',
        '|------|------|--------|---------|--------|---------|'
      )

      for (let i = 0; i < reviewThreads.length; i++) {
        const thread = reviewThreads[i]
        const line = thread.line || thread.startLine || 'N/A'
        const author = thread.comments.nodes[0]?.author?.login || 'Unknown'
        const replyCount = Math.max(0, thread.comments.nodes.length - 1)
        const status = thread.isResolved ? 'Resolved' : 'Open'
        lines.push(
          `| ${escapeMarkdownTableCell(thread.path)} | ${line} | ${author} | ${replyCount} | ${status} | [View](thread-${i + 1}.md) |`
        )
      }
    }

    // General comments section
    if (prComments.length > 0) {
      lines.push(
        '',
        `## General Comments (${prComments.length})`,
        '',
        '| Author | Date/Time | Details |',
        '|--------|-----------|---------|'
      )

      const sortedComments = [...prComments].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      )

      for (const comment of sortedComments) {
        const time = comment.created_at
          ? new Date(comment.created_at)
              .toISOString()
              .replace('T', ' ')
              .substring(0, 19)
          : 'N/A'
        lines.push(
          `| ${escapeMarkdownTableCell(comment.user)} | ${time} | [View](comment-${comment.id}.md) |`
        )
      }
    }
  }

  return lines.join('\n')
}

function generateJobMd(jobMetadata, testResults, testGroups, sections) {
  const duration = formatDuration(
    jobMetadata.started_at,
    jobMetadata.completed_at
  )

  const lines = [
    `# Job: ${jobMetadata.name}`,
    '',
    `ID: ${jobMetadata.id}`,
    `Status: ${jobMetadata.conclusion}`,
    `Started: ${jobMetadata.started_at}`,
    `Completed: ${jobMetadata.completed_at}`,
    `Duration: ${duration}`,
    `URL: ${jobMetadata.html_url}`,
    '',
  ]

  // Add sections list with line counts and links to section files
  if (sections.length > 0) {
    lines.push('## Sections', '')

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const sectionNum = i + 1
      const filename = `job-${jobMetadata.id}-section-${sectionNum}.txt`
      const errorPrefix = section.hasError ? '[error] ' : ''

      if (section.name) {
        lines.push(
          `- ${errorPrefix}[${section.name} (${section.lineCount} lines)](${filename})`
        )
      } else {
        lines.push(`- ${errorPrefix}[${section.lineCount} lines](${filename})`)
      }
    }
    lines.push('')
  }

  // Aggregate test results from all test output JSONs
  let totalFailed = 0
  let totalPassed = 0
  let totalTests = 0
  const allFailedTests = []

  for (const result of testResults) {
    totalFailed += result.numFailedTests || 0
    totalPassed += result.numPassedTests || 0
    totalTests += result.numTotalTests || 0

    if (result.testResults) {
      for (const testResult of result.testResults) {
        if (testResult.assertionResults) {
          for (const assertion of testResult.assertionResults) {
            if (assertion.status === 'failed') {
              allFailedTests.push({
                testFile: testResult.name,
                testName: assertion.fullName || assertion.title,
                error:
                  assertion.failureMessages?.[0]?.substring(0, 100) ||
                  'Unknown',
              })
            }
          }
        }
      }
    }
  }

  if (totalTests > 0) {
    lines.push(
      '## Test Results',
      '',
      `Failed: ${totalFailed}`,
      `Passed: ${totalPassed}`,
      `Total: ${totalTests}`,
      ''
    )

    if (allFailedTests.length > 0) {
      lines.push(
        '## Failed Tests',
        '',
        '| Test File | Test Name | Error |',
        '|-----------|-----------|-------|'
      )

      for (const test of allFailedTests) {
        const shortFile = test.testFile.replace(/.*\/next\.js\/next\.js\//, '')
        const shortError = test.error
          .replace(/\n/g, ' ')
          .substring(0, 60)
          .replace(/\|/g, '\\|')
        lines.push(
          `| ${escapeMarkdownTableCell(shortFile)} | ${escapeMarkdownTableCell(test.testName)} | ${shortError}... |`
        )
      }
      lines.push('')
    }
  }

  if (testGroups.length > 0) {
    lines.push('## Individual Test Files', '')
    const seenPaths = new Set()
    for (const group of testGroups) {
      if (seenPaths.has(group.testPath)) continue
      seenPaths.add(group.testPath)
      const sanitizedName = sanitizeFilename(group.testPath)
      lines.push(
        `- [${group.testPath}](job-${jobMetadata.id}-test-${sanitizedName}.md)`
      )
    }
  }

  return lines.join('\n')
}

function generateTestMd(jobMetadata, testPath, content, testResultJson) {
  const lines = [
    `# Test: ${testPath}`,
    '',
    `Job: [${jobMetadata.name}](job-${jobMetadata.id}.md)`,
    '',
    '## Output',
    '',
    '```',
    content,
    '```',
  ]

  if (testResultJson) {
    lines.push(
      '',
      '## Test Results JSON',
      '',
      '```json',
      JSON.stringify(testResultJson, null, 2),
      '```'
    )
  }

  return lines.join('\n')
}

function generateReviewMd(review) {
  const time = review.submitted_at
    ? new Date(review.submitted_at)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19)
    : 'N/A'

  const lines = [
    `# Review by ${review.user}`,
    '',
    `State: ${review.state}`,
    `Time: ${time}`,
    '',
    '## Comment',
    '',
    review.body.trim(),
  ]

  return lines.join('\n')
}

function generateCommentMd(comment) {
  const time = comment.created_at
    ? new Date(comment.created_at)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19)
    : 'N/A'

  const lines = [
    `# Comment by ${comment.user}`,
    '',
    `Time: ${time}`,
    `URL: ${comment.html_url}`,
    '',
    '## Comment',
    '',
    comment.body?.trim() || '_No content_',
  ]

  return lines.join('\n')
}

function generateThreadMd(thread, index) {
  const lines = [
    `# Thread ${index + 1}: ${thread.path}`,
    '',
    `Line: ${thread.line || thread.startLine || 'N/A'}`,
    `Status: ${thread.isResolved ? 'Resolved' : 'Open'}`,
    '',
  ]

  // Add diff hunk from first comment
  if (thread.comments.nodes[0]?.diffHunk) {
    lines.push('```diff', thread.comments.nodes[0].diffHunk, '```', '')
  }

  // Add all comments
  lines.push('## Comments', '')
  for (const comment of thread.comments.nodes) {
    const date = comment.createdAt
      ? new Date(comment.createdAt).toISOString().split('T')[0]
      : 'N/A'
    lines.push(`### ${comment.author?.login || 'Unknown'} - ${date}`, '')
    lines.push(comment.body || '', '')
    lines.push(`[View on GitHub](${comment.url})`, '', '---', '')
  }

  return lines.join('\n')
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  // Parse CLI argument for PR number
  const prNumberArg = process.argv[2]

  // Step 1: Delete and recreate output directory
  console.log('Cleaning output directory...')
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  // Step 2: Get branch info
  console.log('Getting branch info...')
  const branchInfo = getBranchInfo(prNumberArg)
  console.log(
    `Branch: ${branchInfo.branchName}, PR: ${branchInfo.prNumber || 'N/A'}`
  )

  // Step 3: Get workflow runs
  console.log('Fetching workflow runs...')
  const runs = getWorkflowRuns(branchInfo.branchName)

  if (runs.length === 0) {
    console.log('No workflow runs found for this branch.')
    process.exit(0)
  }

  // Find the most recent run (first in list)
  const latestRun = runs[0]
  console.log(
    `Latest run: ${latestRun.id} (${latestRun.status}/${latestRun.conclusion})`
  )

  // Step 4: Get run metadata
  console.log('Fetching run metadata...')
  const runMetadata = getRunMetadata(latestRun.id)

  // Step 5: Determine fetch strategy based on run status
  const isRunInProgress =
    runMetadata.status === 'in_progress' || runMetadata.status === 'queued'

  let categorizedJobs

  if (isRunInProgress) {
    // Fetch ALL jobs when CI is still running
    console.log('CI is in progress. Fetching all jobs...')
    const allJobs = getAllJobs(latestRun.id)
    categorizedJobs = categorizeJobs(allJobs)
    console.log(
      `Found: ${categorizedJobs.failed.length} failed, ${categorizedJobs.inProgress.length} in progress, ${categorizedJobs.queued.length} queued, ${categorizedJobs.succeeded.length} succeeded`
    )
  } else {
    // For completed runs, only fetch failed jobs (efficiency)
    console.log('Fetching failed jobs...')
    const failedJobIds = getFailedJobs(latestRun.id)
    console.log(`Found ${failedJobIds.length} failed jobs`)

    categorizedJobs = {
      failed: failedJobIds,
      inProgress: [],
      queued: [],
      succeeded: [],
      cancelled: [],
      skipped: [],
    }
  }

  // Fetch PR reviews if we have a PR number
  let reviewData = null
  if (branchInfo.prNumber) {
    console.log('Fetching PR reviews and comments...')
    const reviews = getPRReviews(branchInfo.prNumber)
    const reviewThreads = getPRReviewThreads(branchInfo.prNumber)
    const prComments = getPRComments(branchInfo.prNumber)
    reviewData = { reviews, reviewThreads, prComments }
    console.log(
      `Found ${reviews.length} reviews, ${reviewThreads.length} review threads, ${prComments.length} general comments`
    )
  }

  // Check if we should write an early report (no failed jobs yet)
  const hasNoFailedJobs = categorizedJobs.failed.length === 0
  const hasInProgressOrQueued =
    categorizedJobs.inProgress.length > 0 || categorizedJobs.queued.length > 0

  if (hasNoFailedJobs && !hasInProgressOrQueued) {
    // Completed run with no failures
    console.log('No failed jobs found.')

    // Write review files if we have PR data
    if (reviewData) {
      // Write individual thread files
      for (let i = 0; i < reviewData.reviewThreads.length; i++) {
        const thread = reviewData.reviewThreads[i]
        await fs.writeFile(
          path.join(OUTPUT_DIR, `thread-${i + 1}.md`),
          generateThreadMd(thread, i)
        )
      }
      // Write individual review files for reviews with comments
      for (const review of reviewData.reviews) {
        if (review.body && review.body.trim()) {
          await fs.writeFile(
            path.join(OUTPUT_DIR, `review-${review.id}.md`),
            generateReviewMd(review)
          )
        }
      }
      // Write individual comment files
      for (const comment of reviewData.prComments) {
        await fs.writeFile(
          path.join(OUTPUT_DIR, `comment-${comment.id}.md`),
          generateCommentMd(comment)
        )
      }
    }

    const emptyCategorizedJobs = {
      failed: [],
      inProgress: [],
      queued: [],
      succeeded: [],
      cancelled: [],
      skipped: [],
    }
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'index.md'),
      generateIndexMd(
        branchInfo,
        runMetadata,
        emptyCategorizedJobs,
        {},
        reviewData
      )
    )
    process.exit(0)
  }

  if (hasNoFailedJobs && hasInProgressOrQueued) {
    // In-progress run with no failures yet - still write the progress report
    console.log('No failed jobs yet, but CI is still running.')
  }

  // Step 6: Fetch details for each failed job
  const processedFailedJobs = []
  const jobTestCounts = {}

  for (const job of categorizedJobs.failed) {
    const id = job.id
    const name = job.name
    console.log(`Processing failed job ${id}: ${name}...`)

    // Get full job metadata (getAllJobs already has basic metadata, but getFailedJobs doesn't)
    const jobMetadata = job.started_at ? job : getJobMetadata(id)
    processedFailedJobs.push(jobMetadata)

    // Get job logs
    const logs = getJobLogs(id)

    // Extract test output JSON
    const testResults = extractTestOutputJson(logs)

    // Calculate test counts for index
    let failed = 0
    let total = 0
    for (const result of testResults) {
      failed += result.numFailedTests || 0
      total += result.numTotalTests || 0
    }
    if (total > 0) {
      jobTestCounts[id] = { failed, total }
    }

    // Extract sections from the log
    const sections = extractSections(logs)

    // Write individual section files
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const sectionNum = i + 1
      await fs.writeFile(
        path.join(OUTPUT_DIR, `job-${id}-section-${sectionNum}.txt`),
        section.content
      )
    }

    // Extract test case groups
    const testGroups = extractTestCaseGroups(logs)

    // Write individual test files
    for (const group of testGroups) {
      const sanitizedName = sanitizeFilename(group.testPath)
      // Find matching test result JSON for this test
      const matchingResult = testResults.find((r) =>
        r.testResults?.some((tr) => tr.name?.includes(group.testPath))
      )
      const testMd = generateTestMd(
        jobMetadata,
        group.testPath,
        group.content,
        matchingResult
      )
      await fs.writeFile(
        path.join(OUTPUT_DIR, `job-${id}-test-${sanitizedName}.md`),
        testMd
      )
    }

    // Generate job markdown
    const jobMd = generateJobMd(jobMetadata, testResults, testGroups, sections)
    await fs.writeFile(path.join(OUTPUT_DIR, `job-${id}.md`), jobMd)
  }

  // Step 7: Write PR review files if we have PR data
  if (reviewData) {
    console.log('Generating review files...')
    // Write individual thread files
    for (let i = 0; i < reviewData.reviewThreads.length; i++) {
      const thread = reviewData.reviewThreads[i]
      await fs.writeFile(
        path.join(OUTPUT_DIR, `thread-${i + 1}.md`),
        generateThreadMd(thread, i)
      )
    }
    // Write individual review files for reviews with comments
    for (const review of reviewData.reviews) {
      if (review.body?.trim()) {
        await fs.writeFile(
          path.join(OUTPUT_DIR, `review-${review.id}.md`),
          generateReviewMd(review)
        )
      }
    }
    // Write individual comment files
    for (const comment of reviewData.prComments) {
      await fs.writeFile(
        path.join(OUTPUT_DIR, `comment-${comment.id}.md`),
        generateCommentMd(comment)
      )
    }
  }

  // Step 8: Generate index.md
  console.log('Generating index.md...')
  // Update categorizedJobs.failed with full processed metadata
  const finalCategorizedJobs = {
    ...categorizedJobs,
    failed: processedFailedJobs,
  }
  const indexMd = generateIndexMd(
    branchInfo,
    runMetadata,
    finalCategorizedJobs,
    jobTestCounts,
    reviewData
  )
  await fs.writeFile(path.join(OUTPUT_DIR, 'index.md'), indexMd)

  console.log(`\nDone! Output written to ${OUTPUT_DIR}/index.md`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
