#!/usr/bin/env node

/**
 * Test execution runner: runs every converted integration test with the
 * appropriate pnpm test command and tracks pass/fail per file+mode.
 *
 * Usage:
 *   node scripts/integration-to-e2e/run-tests.mjs                      # run all remaining
 *   node scripts/integration-to-e2e/run-tests.mjs --suite 404-page     # run one suite (all its files + modes)
 *   node scripts/integration-to-e2e/run-tests.mjs --file test/e2e/x.ts # run one file (all modes)
 *   node scripts/integration-to-e2e/run-tests.mjs --concurrency 4      # parallel runs
 *   node scripts/integration-to-e2e/run-tests.mjs --retry-fails        # re-run only failures
 *   node scripts/integration-to-e2e/run-tests.mjs --summary            # print aggregate results
 *   node scripts/integration-to-e2e/run-tests.mjs --timeout 600000     # custom timeout (ms)
 *   node scripts/integration-to-e2e/run-tests.mjs --mode dev           # only run dev mode
 *   node scripts/integration-to-e2e/run-tests.mjs --mode start         # only run start mode
 *   node scripts/integration-to-e2e/run-tests.mjs --list               # list all runs with status
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const CONVERTED = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/integration-to-e2e/converted-tests.json'),
    'utf8'
  )
)
const RESULTS_DIR = path.join(
  REPO_ROOT,
  'scripts/integration-to-e2e/test-results'
)

fs.mkdirSync(RESULTS_DIR, { recursive: true })

// --- Args ---
const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(name)
  return idx >= 0 ? args[idx + 1] : null
}
const hasFlag = (name) => args.includes(name)

const singleSuite = getArg('--suite')
const singleFile = getArg('--file')
const modeFilter = getArg('--mode')
const concurrency = parseInt(getArg('--concurrency') || '1')
const timeout = parseInt(getArg('--timeout') || '300000')
const listMode = hasFlag('--list')
const summaryMode = hasFlag('--summary')
const retryFails = hasFlag('--retry-fails')

// --- Determine modes for a file based on its directory ---
function modesForFile(filePath) {
  if (filePath.startsWith('test/development/')) return ['dev']
  if (filePath.startsWith('test/production/')) return ['start']
  if (filePath.startsWith('test/e2e/')) return ['dev', 'start']
  return ['dev']
}

// --- Build the full run list from converted-tests.json ---
function buildAllRuns() {
  const runs = []
  for (const entry of CONVERTED) {
    const suite = entry.original.replace('test/integration/', '')
    for (const file of entry.converted) {
      for (const mode of modesForFile(file)) {
        runs.push({ file, mode, suite })
      }
    }
  }
  return runs
}

// --- Result file management ---
function resultSlug(file, mode) {
  return file.replace(/^test\//, '').replace(/\//g, '--') + `.${mode}`
}

function resultPath(file, mode) {
  return path.join(RESULTS_DIR, `${resultSlug(file, mode)}.json`)
}

function hasResult(file, mode) {
  return fs.existsSync(resultPath(file, mode))
}

function readResult(file, mode) {
  try {
    return JSON.parse(fs.readFileSync(resultPath(file, mode), 'utf8'))
  } catch {
    return null
  }
}

function writeResult(file, mode, data) {
  const tmpPath = resultPath(file, mode) + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  fs.renameSync(tmpPath, resultPath(file, mode))
}

// --- Parse Jest output ---
function parseJestOutput(output) {
  const summaryMatch = output.match(
    /Tests:\s+(?:(\d+) failed,\s+)?(?:(\d+) skipped,\s+)?(?:(\d+) passed,\s+)?(\d+) total/
  )
  const summary = summaryMatch ? summaryMatch[0] : null
  const failed = summaryMatch ? parseInt(summaryMatch[1] || '0') : null
  const skipped = summaryMatch ? parseInt(summaryMatch[2] || '0') : null
  const passed = summaryMatch ? parseInt(summaryMatch[3] || '0') : null
  const total = summaryMatch ? parseInt(summaryMatch[4] || '0') : null

  const failedTests = []
  const failRegex = /● (.+ › .+)/g
  let m
  while ((m = failRegex.exec(output)) !== null) {
    failedTests.push(m[1].trim())
  }

  return { summary, failed, skipped, passed, total, failedTests }
}

// --- Run a single test file ---
function runTest(file, mode) {
  const command = mode === 'dev' ? 'test-dev-turbo' : 'test-start-turbo'

  return new Promise((resolve) => {
    const startTime = Date.now()
    let output = ''
    let killed = false

    const child = spawn('pnpm', [command, file], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })

    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000)
    }, timeout)

    child.on('close', (code) => {
      clearTimeout(timer)
      const durationMs = Date.now() - startTime

      let verdict
      if (killed) {
        verdict = 'error'
      } else if (code === 0) {
        verdict = 'pass'
      } else {
        verdict = 'fail'
      }

      const parsed = parseJestOutput(output)

      const outputLines = output.split('\n')
      const tailOutput = outputLines.slice(-200).join('\n')

      resolve({
        file,
        mode,
        verdict,
        exitCode: code,
        durationMs,
        killed,
        summary: parsed.summary,
        testsPassed: parsed.passed,
        testsFailed: parsed.failed,
        testsSkipped: parsed.skipped,
        testsTotal: parsed.total,
        failedTests: parsed.failedTests,
        output: tailOutput,
      })
    })
  })
}

// --- Execute a single run with result tracking ---
async function executeRun(run, index, total) {
  const label = `[${index + 1}/${total}]`
  const tag = `${run.file} (${run.mode})`
  process.stdout.write(`${label} ${tag} ... `)

  const result = await runTest(run.file, run.mode)
  writeResult(run.file, run.mode, result)

  const icon =
    result.verdict === 'pass'
      ? 'PASS'
      : result.verdict === 'fail'
        ? 'FAIL'
        : 'ERR '

  const duration = `${(result.durationMs / 1000).toFixed(1)}s`
  const info =
    result.summary || (result.killed ? 'TIMEOUT' : `exit ${result.exitCode}`)
  console.log(`${icon} (${duration}) ${info}`)

  if (result.failedTests.length > 0) {
    for (const t of result.failedTests.slice(0, 5)) {
      console.log(`       - ${t}`)
    }
    if (result.failedTests.length > 5) {
      console.log(`       ... and ${result.failedTests.length - 5} more`)
    }
  }

  return result
}

// --- Load all results for summary ---
function loadAllResults() {
  const allRuns = buildAllRuns()
  const results = []
  for (const run of allRuns) {
    const r = readResult(run.file, run.mode)
    if (r) results.push(r)
  }
  return results
}

// --- List mode ---
if (listMode) {
  const allRuns = buildAllRuns()
  if (modeFilter) {
    console.log(`Showing only mode: ${modeFilter}\n`)
  }
  let done = 0
  for (let i = 0; i < allRuns.length; i++) {
    const run = allRuns[i]
    if (modeFilter && run.mode !== modeFilter) continue
    const r = readResult(run.file, run.mode)
    const status = r ? r.verdict.toUpperCase().padEnd(5) : '     '
    if (r) done++
    console.log(
      `  ${String(i).padStart(4)}  ${status}  ${run.file} (${run.mode})`
    )
  }
  console.log(`\nTotal: ${allRuns.length}  Done: ${done}`)
  process.exit(0)
}

// --- Summary mode ---
if (summaryMode) {
  const results = loadAllResults()
  const allRuns = buildAllRuns()

  if (results.length === 0) {
    console.log('No results yet. Run the tests first.')
    process.exit(0)
  }

  const counts = { pass: 0, fail: 0, error: 0 }
  for (const r of results) {
    counts[r.verdict] = (counts[r.verdict] || 0) + 1
  }

  console.log(`Test Results (${results.length}/${allRuns.length} runs)`)
  console.log(`  PASS:  ${counts.pass}`)
  console.log(`  FAIL:  ${counts.fail}`)
  console.log(`  ERROR: ${counts.error}`)

  const failures = results.filter((r) => r.verdict === 'fail')
  if (failures.length > 0) {
    console.log(`\n--- FAILURES ---`)
    for (const r of failures) {
      console.log(`\n  ${r.file} (${r.mode}):`)
      if (r.summary) console.log(`    ${r.summary}`)
      for (const t of r.failedTests || []) {
        console.log(`    - ${t}`)
      }
    }
  }

  const errors = results.filter((r) => r.verdict === 'error')
  if (errors.length > 0) {
    console.log(`\n--- ERRORS ---`)
    for (const r of errors) {
      console.log(
        `  ${r.file} (${r.mode}): ${r.killed ? 'TIMEOUT' : `exit ${r.exitCode}`}`
      )
    }
  }

  process.exit(0)
}

// --- Main execution ---
async function main() {
  const allRuns = buildAllRuns()
  let queue = []

  if (singleFile) {
    const matching = allRuns.filter((r) => r.file === singleFile)
    if (matching.length === 0) {
      console.error(`File not found in converted tests: ${singleFile}`)
      process.exit(1)
    }
    queue = matching
  } else if (singleSuite) {
    const matching = allRuns.filter((r) => r.suite === singleSuite)
    if (matching.length === 0) {
      console.error(`Suite not found: ${singleSuite}`)
      process.exit(1)
    }
    queue = matching
  } else if (retryFails) {
    for (const run of allRuns) {
      const r = readResult(run.file, run.mode)
      if (r && (r.verdict === 'fail' || r.verdict === 'error')) {
        queue.push(run)
      }
    }
    console.log(`Retrying ${queue.length} failed/errored runs\n`)
  } else {
    let doneCount = 0
    for (const run of allRuns) {
      if (hasResult(run.file, run.mode)) {
        doneCount++
      } else {
        queue.push(run)
      }
    }
    console.log(`${queue.length} runs remaining (${doneCount} already done)\n`)
  }

  if (modeFilter) {
    queue = queue.filter((r) => r.mode === modeFilter)
    console.log(`Filtered to mode '${modeFilter}': ${queue.length} runs\n`)
  }

  if (queue.length === 0) {
    console.log('Nothing to run. Use --summary to see results.')
    process.exit(0)
  }

  const total = queue.length
  const counts = { pass: 0, fail: 0, error: 0 }

  if (concurrency <= 1) {
    for (let i = 0; i < queue.length; i++) {
      const r = await executeRun(queue[i], i, total)
      counts[r.verdict] = (counts[r.verdict] || 0) + 1
    }
  } else {
    let cursor = 0
    async function worker() {
      while (cursor < queue.length) {
        const idx = cursor++
        const r = await executeRun(queue[idx], idx, total)
        counts[r.verdict] = (counts[r.verdict] || 0) + 1
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, () =>
        worker()
      )
    )
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Done: ${total} runs`)
  console.log(
    `  PASS: ${counts.pass}  FAIL: ${counts.fail}  ERROR: ${counts.error}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
