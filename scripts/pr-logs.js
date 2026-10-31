#!/usr/bin/env node

const { execFileSync, spawn } = require('child_process')
const fs = require('fs/promises')
const path = require('path')

const OWNER = 'vercel'
const REPO = 'next.js'
const WORKFLOW_NAME = 'build-and-test'
const OUTPUT_ROOT = path.join(__dirname, 'pr-logs')
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure'])
const LOG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/

function execGh(args) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }).trim()
  } catch (error) {
    const command = `gh ${args.join(' ')}`
    console.error(`Command failed: ${command}`)
    console.error(error.stderr || error.message)
    throw error
  }
}

function execGhJson(args) {
  const output = execGh(args)
  return JSON.parse(output)
}

function execGhLines(args) {
  const output = execGh(args)
  if (!output) return []

  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

function execGhTextAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks = []
    let stderr = ''

    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`Command failed: gh ${args.join(' ')}`)
        error.stderr = stderr.trim()
        reject(error)
        return
      }

      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    child.on('error', reject)
  })
}

function stripLogTimestamps(logs) {
  return logs
    .split('\n')
    .map((line) => line.replace(LOG_TIMESTAMP_RE, ''))
    .join('\n')
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return 'N/A'

  const start = new Date(startedAt)
  const end = new Date(completedAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'N/A'

  const totalSeconds = Math.floor((end - start) / 1000)
  if (totalSeconds < 0) return 'N/A'
  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function formatStatus(job) {
  return job.conclusion ? `${job.status}/${job.conclusion}` : job.status
}

function usage() {
  console.log(`Usage: node scripts/pr-logs.js [PR_NUMBER] [--wait] [--failed-only]

Downloads CI job logs for the latest "${WORKFLOW_NAME}" run on the current PR.

Options:
  --wait         Wait for the current run to finish before downloading logs
  --failed-only  Only download logs for failed jobs
  --help         Show this help text
`)
}

function getBranchInfo(prNumberArg) {
  if (prNumberArg) {
    try {
      const data = execGhJson([
        'pr',
        'view',
        String(prNumberArg),
        '--json',
        'number,headRefName',
      ])

      return {
        prNumber: String(data.number),
        branchName: data.headRefName,
      }
    } catch {
      console.error(`Failed to fetch PR #${prNumberArg}`)
      process.exit(1)
    }
  }

  try {
    const data = execGhJson(['pr', 'view', '--json', 'number,headRefName'])
    return {
      prNumber: String(data.number),
      branchName: data.headRefName,
    }
  } catch {
    console.error(
      'Could not detect a PR from the current branch. Pass a PR number explicitly.'
    )
    process.exit(1)
  }
}

function getLatestWorkflowRun(branchName) {
  const route = `repos/${OWNER}/${REPO}/actions/runs?branch=${encodeURIComponent(branchName)}&per_page=20`
  const runs = execGhLines([
    'api',
    route,
    '--jq',
    `.workflow_runs[] | select(.name == "${WORKFLOW_NAME}") | {id, name, status, conclusion, run_attempt, html_url, created_at, updated_at}`,
  ])

  return runs[0] || null
}

function getRunMetadata(runId) {
  return execGhJson([
    'api',
    `repos/${OWNER}/${REPO}/actions/runs/${runId}`,
    '--jq',
    '{id, name, status, conclusion, run_attempt, html_url, created_at, updated_at}',
  ])
}

function getJobsForRunAttempt(runId, runAttempt) {
  const jobs = []
  let page = 1

  while (true) {
    const pageJobs = execGhLines([
      'api',
      `repos/${OWNER}/${REPO}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100&page=${page}`,
      '--jq',
      '.jobs[] | {id, name, status, conclusion, started_at, completed_at, html_url}',
    ])

    if (pageJobs.length === 0) {
      break
    }

    jobs.push(...pageJobs)

    if (pageJobs.length < 100) {
      break
    }

    page += 1
  }

  return jobs
}

async function downloadJobLog(jobId) {
  const logs = await execGhTextAsync([
    'api',
    `repos/${OWNER}/${REPO}/actions/jobs/${jobId}/logs`,
  ])

  return stripLogTimestamps(logs)
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

function buildOutputDir(prNumber, runId, runAttempt) {
  return path.join(
    OUTPUT_ROOT,
    `pr-${prNumber}`,
    `run-${runId}-attempt-${runAttempt}`
  )
}

function buildIndexLog(branchInfo, runMetadata, jobs, results, outputDir) {
  const lines = [
    `PR: #${branchInfo.prNumber}`,
    `Branch: ${branchInfo.branchName}`,
    `Workflow: ${runMetadata.name}`,
    `Run: ${runMetadata.id} (attempt ${runMetadata.run_attempt})`,
    `Status: ${
      runMetadata.conclusion
        ? `${runMetadata.status}/${runMetadata.conclusion}`
        : runMetadata.status
    }`,
    `Created: ${runMetadata.created_at}`,
    `Updated: ${runMetadata.updated_at || 'N/A'}`,
    `URL: ${runMetadata.html_url}`,
    `Output: ${outputDir}`,
    '',
    `Jobs considered: ${jobs.length}`,
    `Logs downloaded: ${results.filter((result) => result.downloaded).length}`,
    `Logs skipped: ${results.filter((result) => result.skippedReason).length}`,
    `Log download errors: ${results.filter((result) => result.error).length}`,
    '',
    'Jobs:',
    '',
  ]

  for (const result of results) {
    const duration = formatDuration(
      result.job.started_at,
      result.job.completed_at
    )
    lines.push(
      `- ${result.job.id} | ${formatStatus(result.job)} | ${duration} | ${result.job.name}`
    )

    if (result.fileName) {
      lines.push(`  file: ${result.fileName}`)
    }

    if (result.skippedReason) {
      lines.push(`  skipped: ${result.skippedReason}`)
    }

    if (result.error) {
      lines.push(`  error: ${result.error}`)
    }
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    usage()
    return
  }

  const waitFlag = args.includes('--wait')
  const failedOnly = args.includes('--failed-only')
  const prNumberArg = args.find((arg) => !arg.startsWith('--'))

  console.log('Resolving PR...')
  const branchInfo = getBranchInfo(prNumberArg)
  console.log(`Using PR #${branchInfo.prNumber} (${branchInfo.branchName})`)

  console.log('Finding latest workflow run...')
  let runMetadata = getLatestWorkflowRun(branchInfo.branchName)
  if (!runMetadata) {
    console.error(
      `No "${WORKFLOW_NAME}" workflow runs found for branch ${branchInfo.branchName}.`
    )
    process.exit(1)
  }

  if (
    waitFlag &&
    (runMetadata.status === 'queued' || runMetadata.status === 'in_progress')
  ) {
    console.log(`Waiting for run ${runMetadata.id} to complete...`)
    try {
      execFileSync(
        'gh',
        [
          'run',
          'watch',
          String(runMetadata.id),
          '--compact',
          '-R',
          `${OWNER}/${REPO}`,
        ],
        { stdio: 'inherit' }
      )
    } catch {
      // gh run watch exits non-zero when the run fails, which is expected here.
    }

    runMetadata = getRunMetadata(runMetadata.id)
  }

  console.log(
    `Fetching jobs for run ${runMetadata.id} (attempt ${runMetadata.run_attempt})...`
  )
  const allJobs = getJobsForRunAttempt(runMetadata.id, runMetadata.run_attempt)
  const jobs = failedOnly
    ? allJobs.filter((job) => FAILED_CONCLUSIONS.has(job.conclusion))
    : allJobs

  const outputDir = buildOutputDir(
    branchInfo.prNumber,
    runMetadata.id,
    runMetadata.run_attempt
  )
  await fs.rm(outputDir, { recursive: true, force: true })
  await fs.mkdir(outputDir, { recursive: true })

  if (jobs.length === 0) {
    const indexLog = buildIndexLog(branchInfo, runMetadata, jobs, [], outputDir)
    await fs.writeFile(path.join(outputDir, 'index.log'), indexLog)
    console.log(
      `No matching jobs found. Wrote summary to ${outputDir}/index.log`
    )
    return
  }

  const results = new Array(jobs.length)
  console.log(`Downloading logs for ${jobs.length} job(s)...`)

  await mapLimit(
    jobs.map((job, index) => ({ job, index })),
    4,
    async (entry) => {
      const { job, index } = entry
      const fileName = `job-${job.id}-${sanitizeFilename(job.name || 'job')}.log`
      const filePath = path.join(outputDir, fileName)

      if (job.status === 'queued') {
        results[index] = {
          job,
          downloaded: false,
          skippedReason: 'job is still queued',
        }
        return
      }

      if (job.conclusion === 'skipped') {
        results[index] = {
          job,
          downloaded: false,
          skippedReason: 'job was skipped',
        }
        return
      }

      try {
        const logs = await downloadJobLog(job.id)
        await fs.writeFile(filePath, logs)
        results[index] = {
          job,
          downloaded: true,
          fileName,
        }
      } catch (error) {
        const message =
          error.stderr || error.message || 'Unknown error while fetching logs'
        await fs.writeFile(
          filePath,
          `Failed to download logs for job ${job.id} (${job.name})\n\n${message}\n`
        )
        results[index] = {
          job,
          downloaded: false,
          fileName,
          error: message.replace(/\s+/g, ' ').trim(),
        }
      }
    }
  )

  const indexLog = buildIndexLog(
    branchInfo,
    runMetadata,
    jobs,
    results,
    outputDir
  )
  await fs.writeFile(path.join(outputDir, 'index.log'), indexLog)

  console.log(`Done. Logs written to ${outputDir}`)
  console.log(`Summary: ${outputDir}/index.log`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
