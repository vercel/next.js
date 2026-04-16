#!/usr/bin/env node

/**
 * Validation runner: invokes `claude` CLI to validate each integration-to-e2e
 * test conversion one suite at a time. Each suite's result is written to its
 * own markdown file so work is never lost across runs.
 *
 * Usage:
 *   node scripts/integration-to-e2e/run-validation.mjs                  # run all remaining suites
 *   node scripts/integration-to-e2e/run-validation.mjs --suite 404-page # run a single suite
 *   node scripts/integration-to-e2e/run-validation.mjs --from 50        # start from suite index 50
 *   node scripts/integration-to-e2e/run-validation.mjs --concurrency 4  # run 4 in parallel
 *   node scripts/integration-to-e2e/run-validation.mjs --list           # list suites with status
 *   node scripts/integration-to-e2e/run-validation.mjs --summary        # print summary of results
 *   node scripts/integration-to-e2e/run-validation.mjs --retry-fails    # re-run only failed/errored suites
 */

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const CONVERTED = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/integration-to-e2e/converted-tests.json'),
    'utf8'
  )
)
const RESULTS_DIR = path.join(
  REPO_ROOT,
  'scripts/integration-to-e2e/validation-results'
)
const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(REPO_ROOT, 'scripts/integration-to-e2e/validate-conversion.md'),
  'utf8'
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
const startFrom = parseInt(getArg('--from') || '0')
const concurrency = parseInt(getArg('--concurrency') || '1')
const listMode = hasFlag('--list')
const summaryMode = hasFlag('--summary')
const retryFails = hasFlag('--retry-fails')

// --- Per-suite result files (markdown) ---
function resultPath(name) {
  return path.join(RESULTS_DIR, `${name}.md`)
}

function hasResult(name) {
  return fs.existsSync(resultPath(name))
}

function parseVerdict(name) {
  try {
    const content = fs.readFileSync(resultPath(name), 'utf8')
    return extractVerdictFromMarkdown(content)
  } catch {
    return null
  }
}

function extractVerdictFromMarkdown(content) {
  const heading = content.match(/^#\s+.+:\s*(PASS|WARN|FAIL|ERROR)/im)
  if (heading) return heading[1].toLowerCase()
  const verdictLine = content.match(/verdict[:\s]*(pass|warn|fail|error)/im)
  if (verdictLine) return verdictLine[1].toLowerCase()
  return 'unknown'
}

function extractIssuesFromMarkdown(content) {
  const issuesSection = content.match(/## Issues\s*\n([\s\S]*?)(?=\n## |\n$|$)/)
  if (!issuesSection) return []
  const lines = issuesSection[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l && l.toLowerCase() !== 'none')
  return lines
}

function writeResult(name, content) {
  const tmpPath = resultPath(name) + '.tmp'
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, resultPath(name))
}

function loadAllVerdicts() {
  const map = new Map()
  for (const entry of CONVERTED) {
    const name = suiteName(entry)
    if (hasResult(name)) {
      map.set(name, parseVerdict(name))
    }
  }
  return map
}

function suiteName(entry) {
  return entry.original.replace('test/integration/', '')
}

// --- Prompt building ---
function buildPrompt(entry) {
  const name = suiteName(entry)
  const fileList = [...entry.originalTestFiles, ...entry.converted]
    .map((f) => path.join(REPO_ROOT, f))
    .join('\n')

  const origDir = path.join(REPO_ROOT, entry.original)
  const convDirs = [
    ...new Set(
      entry.converted.map((f) => path.dirname(path.join(REPO_ROOT, f)))
    ),
  ]

  return `You are validating the conversion of the Next.js integration test suite "${name}" to the e2e test format.

## Suite

Original directory: ${origDir}
Original test files: ${entry.originalTestFiles.join(', ')}
Converted test files: ${entry.converted.join(', ')}
Converted fixture directories: ${convDirs.join(', ')}

## Steps

1. Read ALL original test files in full: ${fileList
    .split('\n')
    .filter((f) => f.includes('test/integration/'))
    .join(', ')}
2. Read ALL converted test files in full: ${fileList
    .split('\n')
    .filter((f) => !f.includes('test/integration/'))
    .join(', ')}
3. Use Glob on the converted fixture directories to verify fixture files exist (pages, components, next.config.js, etc.).
4. Evaluate every criterion from the checklist below.
5. Return your result as a markdown document. The first line MUST be: # ${name}: PASS|WARN|FAIL

${PROMPT_TEMPLATE}`
}

// --- Run a single suite via claude CLI ---
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      [
        '-p',
        '--output-format',
        'text',
        '--allowedTools',
        'Read',
        'Glob',
        'Grep',
        '--permission-mode',
        'bypassPermissions',
        '--model',
        'claude-opus-4-7',
        '--effort',
        'high',
      ],
      {
        cwd: REPO_ROOT,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(`claude failed: ${error.message}\n${stderr}`))
        } else {
          resolve(stdout)
        }
      }
    )
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

async function validateSuite(entry, index, total) {
  const name = suiteName(entry)
  const label = `[${index + 1}/${total}]`
  process.stdout.write(`${label} ${name} ... `)

  let verdict = 'error'
  let issues = []

  try {
    const output = await runClaude(buildPrompt(entry))
    verdict = extractVerdictFromMarkdown(output)
    issues = extractIssuesFromMarkdown(output)
    writeResult(name, output)
  } catch (err) {
    const errorContent = `# ${name}: ERROR\n\nclaude CLI invocation failed.\n\n## Issues\n\n- ${err.message}\n`
    writeResult(name, errorContent)
    issues = [err.message]
  }

  const icon =
    verdict === 'pass'
      ? 'PASS'
      : verdict === 'warn'
        ? 'WARN'
        : verdict === 'fail'
          ? 'FAIL'
          : 'ERR '
  console.log(`${icon}${issues.length > 0 ? ` (${issues.length} issues)` : ''}`)

  if (issues.length > 0) {
    for (const issue of issues.slice(0, 3)) {
      console.log(`       - ${issue}`)
    }
    if (issues.length > 3) {
      console.log(`       ... and ${issues.length - 3} more`)
    }
  }

  return { verdict }
}

// --- List mode ---
if (listMode) {
  const verdicts = loadAllVerdicts()
  console.log(`Suites: ${CONVERTED.length}  |  Completed: ${verdicts.size}\n`)
  for (let i = 0; i < CONVERTED.length; i++) {
    const name = suiteName(CONVERTED[i])
    const v = verdicts.get(name)
    const status = v ? v.toUpperCase().padEnd(5) : '     '
    console.log(`  ${String(i).padStart(3)}  ${status}  ${name}`)
  }
  process.exit(0)
}

// --- Summary mode ---
if (summaryMode) {
  const verdicts = loadAllVerdicts()
  if (verdicts.size === 0) {
    console.log('No results yet. Run the validator first.')
    process.exit(0)
  }

  const counts = { pass: 0, warn: 0, fail: 0, error: 0, unknown: 0 }
  for (const v of verdicts.values()) {
    counts[v] = (counts[v] || 0) + 1
  }

  console.log(
    `Validation Summary (${verdicts.size}/${CONVERTED.length} suites)`
  )
  console.log(`  PASS:  ${counts.pass}`)
  console.log(`  WARN:  ${counts.warn}`)
  console.log(`  FAIL:  ${counts.fail}`)
  console.log(`  ERROR: ${counts.error}`)
  if (counts.unknown) console.log(`  UNKNOWN: ${counts.unknown}`)

  const failNames = [...verdicts.entries()]
    .filter(([, v]) => v === 'fail')
    .map(([name]) => name)
  if (failNames.length > 0) {
    console.log(`\n--- FAILURES ---`)
    for (const name of failNames) {
      const content = fs.readFileSync(resultPath(name), 'utf8')
      const issues = extractIssuesFromMarkdown(content)
      console.log(`\n  ${name}:`)
      for (const issue of issues) {
        console.log(`    - ${issue}`)
      }
    }
  }

  const errorNames = [...verdicts.entries()]
    .filter(([, v]) => v === 'error')
    .map(([name]) => name)
  if (errorNames.length > 0) {
    console.log(`\n--- ERRORS ---`)
    for (const name of errorNames) {
      const content = fs.readFileSync(resultPath(name), 'utf8')
      const issues = extractIssuesFromMarkdown(content)
      console.log(`\n  ${name}: ${issues[0] || 'unknown error'}`)
    }
  }

  process.exit(0)
}

// --- Main execution ---
async function main() {
  let queue = []

  if (singleSuite) {
    const entry = CONVERTED.find((e) => suiteName(e) === singleSuite)
    if (!entry) {
      console.error(`Suite not found: ${singleSuite}`)
      process.exit(1)
    }
    queue = [{ entry, index: CONVERTED.indexOf(entry) }]
  } else if (retryFails) {
    for (let i = 0; i < CONVERTED.length; i++) {
      const name = suiteName(CONVERTED[i])
      const v = parseVerdict(name)
      if (v && (v === 'fail' || v === 'error')) {
        queue.push({ entry: CONVERTED[i], index: i })
      }
    }
    console.log(`Retrying ${queue.length} failed/errored suites\n`)
  } else {
    let doneCount = 0
    for (let i = startFrom; i < CONVERTED.length; i++) {
      const name = suiteName(CONVERTED[i])
      if (hasResult(name)) {
        doneCount++
      } else {
        queue.push({ entry: CONVERTED[i], index: i })
      }
    }
    console.log(
      `${queue.length} suites remaining (${doneCount} already done)\n`
    )
  }

  if (queue.length === 0) {
    console.log('All suites have been validated. Use --summary to see results.')
    process.exit(0)
  }

  const total = queue.length
  const results = { pass: 0, warn: 0, fail: 0, error: 0 }

  if (concurrency <= 1) {
    for (let i = 0; i < queue.length; i++) {
      const r = await validateSuite(queue[i].entry, i, total)
      results[r.verdict] = (results[r.verdict] || 0) + 1
    }
  } else {
    let cursor = 0
    async function worker() {
      while (cursor < queue.length) {
        const idx = cursor++
        const r = await validateSuite(queue[idx].entry, idx, total)
        results[r.verdict] = (results[r.verdict] || 0) + 1
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, () =>
        worker()
      )
    )
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Done: ${total} suites`)
  console.log(
    `  PASS: ${results.pass}  WARN: ${results.warn}  FAIL: ${results.fail}  ERROR: ${results.error}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
