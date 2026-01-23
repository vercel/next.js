const { execSync } = require('child_process')
const fs = require('fs/promises')
const path = require('path')

const OUTPUT_DIR = path.join(__dirname, 'ci-failures')

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
  return logContent.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm, '')
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

function getBranchInfo() {
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

function extractAllGroups(logContent) {
  // Extract ALL ##[group]...##[endgroup] blocks (top-level groups)
  const groups = []
  const regex = /##\[group\]([^\n]*)([\s\S]*?)##\[endgroup\]/g
  let match = regex.exec(logContent)

  while (match !== null) {
    const groupName = match[1].trim()
    const content = stripTimestamps(match[2].trim())
    groups.push({ groupName, content })
    match = regex.exec(logContent)
  }

  return groups
}

// ============================================================================
// Markdown Generation Functions
// ============================================================================

function generateIndexMd(branchInfo, runMetadata, failedJobs, jobTestCounts) {
  const lines = ['# CI Failures Report', '', `Branch: ${branchInfo.branchName}`]

  if (branchInfo.prNumber) {
    lines.push(`PR: #${branchInfo.prNumber}`)
  }

  lines.push(
    `Run: ${runMetadata.id} (attempt ${runMetadata.run_attempt})`,
    `Status: ${runMetadata.conclusion}`,
    `Time: ${runMetadata.created_at} - ${runMetadata.updated_at}`,
    `URL: ${runMetadata.html_url}`,
    '',
    `## Failed Jobs (${failedJobs.length})`,
    '',
    '| Job | Name | Duration | Tests | File |',
    '|-----|------|----------|-------|------|'
  )

  for (const job of failedJobs) {
    const duration = formatDuration(job.started_at, job.completed_at)
    const testCount = jobTestCounts[job.id]
    const testsStr = testCount
      ? `${testCount.failed}/${testCount.total}`
      : 'N/A'
    lines.push(
      `| ${job.id} | ${escapeMarkdownTableCell(job.name)} | ${duration} | ${testsStr} | [Details](job-${job.id}.md) |`
    )
  }

  return lines.join('\n')
}

function generateJobMd(jobMetadata, testResults, testGroups, allGroups) {
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
    `Full Log: [job-${jobMetadata.id}-full-log.txt](job-${jobMetadata.id}-full-log.txt)`,
    '',
  ]

  // Add groups table
  if (allGroups.length > 0) {
    lines.push(
      '## Groups',
      '',
      '| # | Group Name | File |',
      '|---|------------|------|'
    )

    for (let i = 0; i < allGroups.length; i++) {
      const group = allGroups[i]
      const groupNum = i + 1
      const sanitizedName = sanitizeFilename(group.groupName)
      const filename = `job-${jobMetadata.id}-group-${groupNum}-${sanitizedName}.md`
      const displayName =
        group.groupName.substring(0, 60) +
        (group.groupName.length > 60 ? '...' : '')
      lines.push(`| ${groupNum} | ${escapeMarkdownTableCell(displayName)} | [View](${filename}) |`)
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
        lines.push(`| ${escapeMarkdownTableCell(shortFile)} | ${escapeMarkdownTableCell(test.testName)} | ${shortError}... |`)
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

function generateGroupMd(jobMetadata, groupNumber, groupName, content) {
  const lines = [
    `# Group: ${groupName}`,
    '',
    `Job: [${jobMetadata.name}](job-${jobMetadata.id}.md)`,
    `Group #: ${groupNumber}`,
    '',
    '## Output',
    '',
    '```',
    content,
    '```',
  ]

  return lines.join('\n')
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  // Step 1: Delete and recreate output directory
  console.log('Cleaning output directory...')
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  // Step 2: Get branch info
  console.log('Getting branch info...')
  const branchInfo = getBranchInfo()
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

  // Step 5: Get failed jobs
  console.log('Fetching failed jobs...')
  const failedJobIds = getFailedJobs(latestRun.id)
  console.log(`Found ${failedJobIds.length} failed jobs`)

  if (failedJobIds.length === 0) {
    console.log('No failed jobs found.')
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'index.md'),
      generateIndexMd(branchInfo, runMetadata, [], {})
    )
    process.exit(0)
  }

  // Step 6: Fetch details for each failed job
  const failedJobs = []
  const jobTestCounts = {}

  for (const { id, name } of failedJobIds) {
    console.log(`Processing job ${id}: ${name}...`)

    // Get job metadata
    const jobMetadata = getJobMetadata(id)
    failedJobs.push(jobMetadata)

    // Get job logs
    const logs = getJobLogs(id)

    // Write full log
    await fs.writeFile(path.join(OUTPUT_DIR, `job-${id}-full-log.txt`), logs)

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

    // Extract all groups (top-level)
    const allGroups = extractAllGroups(logs)

    // Write individual group files
    for (let i = 0; i < allGroups.length; i++) {
      const group = allGroups[i]
      const groupNum = i + 1
      const sanitizedName = sanitizeFilename(group.groupName)
      const groupMd = generateGroupMd(
        jobMetadata,
        groupNum,
        group.groupName,
        group.content
      )
      await fs.writeFile(
        path.join(
          OUTPUT_DIR,
          `job-${id}-group-${groupNum}-${sanitizedName}.md`
        ),
        groupMd
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
    const jobMd = generateJobMd(jobMetadata, testResults, testGroups, allGroups)
    await fs.writeFile(path.join(OUTPUT_DIR, `job-${id}.md`), jobMd)
  }

  // Step 7: Generate index.md
  console.log('Generating index.md...')
  const indexMd = generateIndexMd(
    branchInfo,
    runMetadata,
    failedJobs,
    jobTestCounts
  )
  await fs.writeFile(path.join(OUTPUT_DIR, 'index.md'), indexMd)

  console.log(`\nDone! Output written to ${OUTPUT_DIR}/index.md`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
