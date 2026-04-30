#!/usr/bin/env node

/**
 * Failure assessor: invokes `claude` CLI to do a quick assessment of each
 * failing test run, determining whether the failure is conversion-related
 * or a pre-existing framework issue.
 *
 * Usage:
 *   node scripts/integration-to-e2e/assess-failures.mjs                  # assess all failures
 *   node scripts/integration-to-e2e/assess-failures.mjs --file <slug>    # assess a single result
 *   node scripts/integration-to-e2e/assess-failures.mjs --concurrency 4  # run 4 in parallel
 *   node scripts/integration-to-e2e/assess-failures.mjs --list           # list failures with status
 *   node scripts/integration-to-e2e/assess-failures.mjs --summary        # print summary
 *   node scripts/integration-to-e2e/assess-failures.mjs --retry          # re-run errored assessments
 */

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const RESULTS_DIR = path.join(
  REPO_ROOT,
  'scripts/integration-to-e2e/test-results'
)
const ASSESS_DIR = path.join(
  REPO_ROOT,
  'scripts/integration-to-e2e/failure-assessments'
)
const CONVERTED = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/integration-to-e2e/converted-tests.json'),
    'utf8'
  )
)

fs.mkdirSync(ASSESS_DIR, { recursive: true })

// --- Args ---
const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(name)
  return idx >= 0 ? args[idx + 1] : null
}
const hasFlag = (name) => args.includes(name)

const singleFile = getArg('--file')
const concurrency = parseInt(getArg('--concurrency') || '2')
const listMode = hasFlag('--list')
const summaryMode = hasFlag('--summary')
const retryMode = hasFlag('--retry')

// --- Helpers ---
function assessPath(resultSlug) {
  return path.join(ASSESS_DIR, `${resultSlug}.md`)
}

function hasAssessment(resultSlug) {
  return fs.existsSync(assessPath(resultSlug))
}

function writeAssessment(resultSlug, content) {
  const tmpPath = assessPath(resultSlug) + '.tmp'
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, assessPath(resultSlug))
}

function parseCategory(content) {
  const match = content.match(
    /^#\s+.+:\s*(CONVERSION-BUG|PRE-EXISTING|INFRA|UNKNOWN)/im
  )
  return match ? match[1].toLowerCase() : 'unknown'
}

function loadFailures() {
  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json'))
  const failures = []
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'))
    if (d.verdict === 'pass') continue
    failures.push({ resultFile: f, slug: f.replace('.json', ''), ...d })
  }
  return failures
}

function findOriginalSuite(testFile) {
  for (const entry of CONVERTED) {
    if (entry.converted.includes(testFile)) {
      return entry
    }
  }
  return null
}

function truncateOutput(output, maxLines = 150) {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  const head = lines.slice(0, 40).join('\n')
  const tail = lines.slice(-110).join('\n')
  return head + '\n\n... [truncated middle] ...\n\n' + tail
}

// --- Prompt ---
function buildPrompt(failure) {
  const entry = findOriginalSuite(failure.file)
  const originalInfo = entry
    ? `Original integration test: ${entry.original}\nOriginal test files: ${entry.originalTestFiles.join(', ')}`
    : 'Original suite: unknown'

  const outputExcerpt = truncateOutput(failure.output || '', 150)

  return `You are assessing a test failure to determine its root cause. Classify it as one of:

- **CONVERSION-BUG**: The failure is caused by the test conversion (e.g. missing fixture file, wrong assertion, incorrect test setup, missing config). These can be fixed by editing the converted test or its fixtures.
- **PRE-EXISTING**: The failure is caused by a pre-existing framework bug or behavior on this branch, unrelated to the conversion. The original integration test would likely also fail.
- **INFRA**: Infrastructure issue (permissions, sandbox, missing binary, timeout, packing error unrelated to the test itself).
- **UNKNOWN**: Cannot determine from the available information.

## Test info

Converted test file: ${failure.file}
Test mode: ${failure.mode}
${originalInfo}

## Test result

Exit code: ${failure.exitCode}
Duration: ${Math.round(failure.durationMs / 1000)}s
Summary: ${failure.summary || 'none'}
Failed tests: ${(failure.failedTests || []).join(', ') || 'none listed'}

## Test output (may be truncated)

\`\`\`
${outputExcerpt}
\`\`\`

## Steps

1. Read the converted test file: ${failure.file}
2. If there's an original test file, read it to compare: ${entry ? entry.originalTestFiles.join(', ') : 'N/A'}
3. Look at the error output to determine root cause
4. If the error suggests a missing fixture, check using Glob on the test's directory
5. Classify the failure

## Output format

Return a markdown document. The first line MUST be:

# <test-slug>: CONVERSION-BUG|PRE-EXISTING|INFRA|UNKNOWN

Then include:

## Summary
One paragraph explaining the root cause.

## Evidence
Key evidence from the output/code that led to your classification.

## Fix suggestion
If CONVERSION-BUG: what needs to be fixed.
If PRE-EXISTING: what framework issue is causing it.
If INFRA: what infrastructure issue is involved.
`
}

// --- Run claude CLI ---
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
        'claude-sonnet-4-20250514',
      ],
      {
        cwd: REPO_ROOT,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
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

async function assessFailure(failure, index, total) {
  const label = `[${index + 1}/${total}]`
  process.stdout.write(`${label} ${failure.file} (${failure.mode}) ... `)

  let category = 'error'

  try {
    const output = await runClaude(buildPrompt(failure))
    category = parseCategory(output)
    writeAssessment(failure.slug, output)
  } catch (err) {
    const errorContent = `# ${failure.slug}: UNKNOWN\n\n## Summary\n\nclaude CLI invocation failed.\n\n## Evidence\n\n${err.message}\n`
    writeAssessment(failure.slug, errorContent)
  }

  const display = category.toUpperCase()
  console.log(display)

  return { category }
}

// --- List mode ---
if (listMode) {
  const failures = loadFailures()
  let assessed = 0
  for (const f of failures) {
    const cat = hasAssessment(f.slug)
      ? parseCategory(fs.readFileSync(assessPath(f.slug), 'utf8'))
      : null
    const status = cat ? cat.toUpperCase().padEnd(16) : '                '
    if (cat) assessed++
    console.log(`  ${status}  ${f.file} (${f.mode})`)
  }
  console.log(`\n${assessed}/${failures.length} assessed`)
  process.exit(0)
}

// --- Summary mode ---
if (summaryMode) {
  const failures = loadFailures()
  const counts = {}
  const byCategory = {}

  for (const f of failures) {
    if (!hasAssessment(f.slug)) continue
    const content = fs.readFileSync(assessPath(f.slug), 'utf8')
    const cat = parseCategory(content)
    counts[cat] = (counts[cat] || 0) + 1
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push({ file: f.file, mode: f.mode, content })
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log(`Failure Assessments (${total}/${failures.length})`)
  for (const [cat, count] of Object.entries(counts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${cat.toUpperCase().padEnd(16)}: ${count}`)
  }

  for (const [cat, items] of Object.entries(byCategory).sort(
    (a, b) => b[1].length - a[1].length
  )) {
    console.log(`\n--- ${cat.toUpperCase()} (${items.length}) ---`)
    for (const item of items.slice(0, 10)) {
      console.log(`  ${item.file} (${item.mode})`)
    }
    if (items.length > 10) console.log(`  ... and ${items.length - 10} more`)
  }

  process.exit(0)
}

// --- Main execution ---
async function main() {
  const failures = loadFailures()
  let queue = []

  if (singleFile) {
    const match = failures.find((f) => f.slug === singleFile)
    if (!match) {
      console.error(`Result not found: ${singleFile}`)
      console.error(
        'Available slugs:',
        failures
          .slice(0, 5)
          .map((f) => f.slug)
          .join(', '),
        '...'
      )
      process.exit(1)
    }
    queue = [match]
  } else if (retryMode) {
    for (const f of failures) {
      if (hasAssessment(f.slug)) {
        const cat = parseCategory(fs.readFileSync(assessPath(f.slug), 'utf8'))
        if (cat === 'unknown' || cat === 'error') {
          queue.push(f)
        }
      }
    }
    console.log(`Retrying ${queue.length} unknown/errored assessments\n`)
  } else {
    let done = 0
    for (const f of failures) {
      if (hasAssessment(f.slug)) {
        done++
      } else {
        queue.push(f)
      }
    }
    console.log(`${queue.length} failures remaining (${done} already done)\n`)
  }

  if (queue.length === 0) {
    console.log(
      'All failures have been assessed. Use --summary to see results.'
    )
    process.exit(0)
  }

  const total = queue.length
  const results = {}

  if (concurrency <= 1) {
    for (let i = 0; i < queue.length; i++) {
      const r = await assessFailure(queue[i], i, total)
      results[r.category] = (results[r.category] || 0) + 1
    }
  } else {
    let cursor = 0
    async function worker() {
      while (cursor < queue.length) {
        const idx = cursor++
        const r = await assessFailure(queue[idx], idx, total)
        results[r.category] = (results[r.category] || 0) + 1
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, () =>
        worker()
      )
    )
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Done: ${total} assessments`)
  for (const [cat, count] of Object.entries(results).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${cat.toUpperCase().padEnd(16)}: ${count}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
