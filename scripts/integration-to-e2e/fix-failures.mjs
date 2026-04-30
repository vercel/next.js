#!/usr/bin/env node

/**
 * Failure fixer: invokes `claude` CLI to investigate and attempt to fix
 * failing converted tests. Focuses on CONVERSION-BUG assessments by default.
 *
 * Usage:
 *   node scripts/integration-to-e2e/fix-failures.mjs                     # fix all CONVERSION-BUG cases
 *   node scripts/integration-to-e2e/fix-failures.mjs --file <slug>       # fix a single one
 *   node scripts/integration-to-e2e/fix-failures.mjs --concurrency 3     # run 3 in parallel
 *   node scripts/integration-to-e2e/fix-failures.mjs --include pre-existing  # also try PRE-EXISTING
 *   node scripts/integration-to-e2e/fix-failures.mjs --list              # show targeted failures with status
 *   node scripts/integration-to-e2e/fix-failures.mjs --retry             # re-try ones where prior fix didn't pass
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
const FIX_DIR = path.join(REPO_ROOT, 'scripts/integration-to-e2e/fix-attempts')
const CONVERTED = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/integration-to-e2e/converted-tests.json'),
    'utf8'
  )
)

fs.mkdirSync(FIX_DIR, { recursive: true })

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
const retryMode = hasFlag('--retry')
const includeArg = getArg('--include') // 'pre-existing' or 'unknown' to broaden targets

// --- Helpers ---
function fixReportPath(slug) {
  return path.join(FIX_DIR, `${slug}.md`)
}

function hasFixReport(slug) {
  return fs.existsSync(fixReportPath(slug))
}

function writeFixReport(slug, content) {
  const tmpPath = fixReportPath(slug) + '.tmp'
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, fixReportPath(slug))
}

function parseOutcome(content) {
  // The subagent's first line should be "# <slug>: FIXED|PARTIAL|NOT_FIXED|NOT_FIXABLE"
  const match = content.match(
    /^#\s+.+:\s*(FIXED|PARTIAL|NOT_FIXED|NOT_FIXABLE|ERROR)/im
  )
  return match ? match[1].toUpperCase() : 'UNKNOWN'
}

function parseCategory(content) {
  const match = content.match(
    /^#\s+.+:\s*(CONVERSION-BUG|PRE-EXISTING|INFRA|UNKNOWN)/im
  )
  return match ? match[1].toLowerCase() : 'unknown'
}

function assessPath(slug) {
  return path.join(ASSESS_DIR, `${slug}.md`)
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

function truncateOutput(output, maxLines = 200) {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  const head = lines.slice(0, 60).join('\n')
  const tail = lines.slice(-140).join('\n')
  return head + '\n\n... [truncated middle] ...\n\n' + tail
}

// --- Prompt ---
function buildPrompt(failure, assessmentContent) {
  const entry = findOriginalSuite(failure.file)
  const originalTestFiles = entry ? entry.originalTestFiles : []
  const originalAppDir = entry ? entry.original : null

  const outputExcerpt = truncateOutput(failure.output || '', 200)
  const assessmentExcerpt = assessmentContent
    ? `\n## Prior assessment\n\n${assessmentContent}\n`
    : ''

  return `You are an autonomous coding agent fixing a failing converted test. The test was converted from integration-test style to e2e-utils/nextTestSetup style; you need to determine the root cause and apply a minimal fix.

## Ground rules

1. Edit ONLY these locations:
   - The converted test file and its fixture directory: \`${failure.file}\` and the directory it lives in (i.e. \`${path.dirname(failure.file)}\`)
   - Shared test helpers in \`test/lib/\` only if strictly necessary to fix this test's conversion bug
   Never touch files under \`packages/next/\`, \`turbopack/\`, \`crates/\`, or any production code — that is out of scope. If the root cause is a framework bug, stop and report NOT_FIXABLE.

2. Verify your fix by running exactly this command from the repo root (it runs only the target test with the correct mode, no packing, fast):
   \`\`\`
   NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=${failure.mode} HEADLESS=true pnpm jest --runInBand ${failure.file}
   \`\`\`
   Use Bash to run this. Expect it to take 30-90 seconds. Read the output to check if all previously-failing tests now pass.

3. Keep the fix minimal and match the original integration test's semantics. Prefer:
   - Adding missing fixtures copied from the original test's fixture directory
   - Adjusting mode guards (\`isNextDev\`, \`isNextStart\`)
   - Fixing wrong assertions (snapshot updates OK if the content is functionally equivalent)
   - Adding missing \`dependencies\` in \`nextTestSetup\`
   - Correcting \`patchFile\` / setup flow
   Avoid large rewrites unless clearly warranted.

4. If the fix requires substantive test redesign OR the test depends on a pre-existing framework bug, do NOT force a fix. Report NOT_FIXABLE with a clear explanation.

5. Do NOT modify other tests or unrelated code.

6. Do NOT use \`NEXT_SKIP_ISOLATE=1\` in a test that tests module resolution, new \`require()\` paths, or edge-runtime bundling. If the failure relates to any of those, drop \`NEXT_SKIP_ISOLATE=1\` from the verification command.

## Context

Converted test file: \`${failure.file}\`
Test mode: ${failure.mode}
${originalAppDir ? `Original integration app directory: \`${originalAppDir}\`` : 'Original app directory: unknown'}
${originalTestFiles.length ? `Original test files: ${originalTestFiles.map((f) => `\`${f}\``).join(', ')}` : ''}

Summary: ${failure.summary || 'none'}
Failed tests (first batch):
${(failure.failedTests || []).map((t) => '  - ' + t).join('\n') || '  (none listed)'}

## Failure output (may be truncated)

\`\`\`
${outputExcerpt}
\`\`\`
${assessmentExcerpt}
## Workflow

1. Read the converted test file and the original test file(s) to understand the intent.
2. Read relevant fixtures if needed.
3. Identify the minimal change.
4. Apply the change using Edit/Write.
5. Run the verification command with Bash.
6. If tests still fail, read output and iterate at most 2 more times.
7. Write your final report.

## Report format

The first line of your response MUST be exactly:

# ${failure.slug}: FIXED

or

# ${failure.slug}: PARTIAL

or

# ${failure.slug}: NOT_FIXED

or

# ${failure.slug}: NOT_FIXABLE

Where:
- **FIXED**: All previously failing tests now pass
- **PARTIAL**: Some failing tests now pass, but not all (report how many)
- **NOT_FIXED**: Attempted a fix but tests still fail
- **NOT_FIXABLE**: The issue is outside the allowed scope (framework bug, needs human judgment)

Then include:

## Root cause
(One paragraph)

## Fix applied
(List of files changed with brief explanation, or "none" if NOT_FIXABLE)

## Verification
(Summary of test run results after fix)
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
        '--permission-mode',
        'bypassPermissions',
        '--model',
        'claude-opus-4-7',
      ],
      {
        cwd: REPO_ROOT,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 15 * 60 * 1000, // 15 min per fix
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

async function fixFailure(failure, index, total) {
  const label = `[${index + 1}/${total}]`
  process.stdout.write(`${label} ${failure.file} (${failure.mode}) ... `)

  let outcome = 'ERROR'

  try {
    const assessmentContent = fs.existsSync(assessPath(failure.slug))
      ? fs.readFileSync(assessPath(failure.slug), 'utf8')
      : ''

    const output = await runClaude(buildPrompt(failure, assessmentContent))
    outcome = parseOutcome(output)
    writeFixReport(failure.slug, output)
  } catch (err) {
    const errorContent = `# ${failure.slug}: ERROR\n\n## Root cause\n\nclaude CLI invocation failed.\n\n## Fix applied\nnone\n\n## Verification\n${err.message}\n`
    writeFixReport(failure.slug, errorContent)
  }

  console.log(outcome)

  return { outcome }
}

// --- Build target queue ---
function buildTargets() {
  const failures = loadFailures()
  const targets = []

  for (const f of failures) {
    const aPath = assessPath(f.slug)
    if (!fs.existsSync(aPath)) continue

    const assessContent = fs.readFileSync(aPath, 'utf8')
    const category = parseCategory(assessContent)

    const include =
      category === 'conversion-bug' ||
      (includeArg === 'pre-existing' && category === 'pre-existing') ||
      (includeArg === 'unknown' && category === 'unknown') ||
      includeArg === 'all'

    if (!include) continue

    if (singleFile && f.slug !== singleFile) continue

    targets.push({ ...f, category })
  }

  return targets
}

// --- List mode ---
if (listMode) {
  const targets = buildTargets()
  for (const t of targets) {
    let status = '         '
    if (hasFixReport(t.slug)) {
      const r = parseOutcome(fs.readFileSync(fixReportPath(t.slug), 'utf8'))
      status = r.padEnd(12)
    }
    console.log(`  ${status}  ${t.file} (${t.mode})`)
  }
  console.log(`\n${targets.length} targeted failures`)
  process.exit(0)
}

// --- Main ---
async function main() {
  const targets = buildTargets()

  let queue = []
  if (retryMode) {
    for (const t of targets) {
      if (!hasFixReport(t.slug)) {
        queue.push(t)
        continue
      }
      const outcome = parseOutcome(
        fs.readFileSync(fixReportPath(t.slug), 'utf8')
      )
      if (outcome === 'NOT_FIXED' || outcome === 'ERROR') queue.push(t)
    }
    console.log(`Retrying ${queue.length} failed attempts\n`)
  } else {
    let done = 0
    for (const t of targets) {
      if (hasFixReport(t.slug)) done++
      else queue.push(t)
    }
    console.log(
      `${queue.length} targets remaining (${done} already attempted)\n`
    )
  }

  if (queue.length === 0) {
    console.log('Nothing to fix. Use --list to inspect.')
    process.exit(0)
  }

  const total = queue.length
  const results = {}

  if (concurrency <= 1) {
    for (let i = 0; i < queue.length; i++) {
      const r = await fixFailure(queue[i], i, total)
      results[r.outcome] = (results[r.outcome] || 0) + 1
    }
  } else {
    let cursor = 0
    async function worker() {
      while (cursor < queue.length) {
        const idx = cursor++
        const r = await fixFailure(queue[idx], idx, total)
        results[r.outcome] = (results[r.outcome] || 0) + 1
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, () =>
        worker()
      )
    )
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Done: ${total} fix attempts`)
  for (const [k, v] of Object.entries(results).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)}: ${v}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
