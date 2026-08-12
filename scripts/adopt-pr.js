#!/usr/bin/env node
// @ts-check

/**
 * Adopt an external fork pull request into vercel/next.js.
 *
 * Pull requests from forks run without repository secrets, so deploy tests
 * never run on external contributions. Adopting re-pushes the contributor's
 * commits to a branch in vercel/next.js and opens a replacement pull request
 * from that branch, where CI is trusted.
 *
 * That trust is the entire risk. See confirmAdoption() below.
 *
 *   node scripts/adopt-pr.js <pr-number>
 *   node scripts/adopt-pr.js <pr-number> --dry-run
 */

const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')

const REPO = 'vercel/next.js'
const BASE_BRANCH = 'canary'

/**
 * An expected, actionable problem: bad arguments, a PR that should not be
 * adopted, a dirty tree, a declined confirmation. These print as a plain
 * message. Everything else keeps its stack and `cause` chain, because an
 * unexpected failure is worth the full trace.
 */
class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

const useColor = process.stdout.isTTY === true
/** @type {(text: string) => string} */
const bold = (text) => (useColor ? `\x1b[1m${text}\x1b[0m` : text)
/** @type {(text: string) => string} */
const red = (text) => (useColor ? `\x1b[31m${text}\x1b[0m` : text)
/** @type {(text: string) => string} */
const yellow = (text) => (useColor ? `\x1b[33m${text}\x1b[0m` : text)
/** @type {(text: string) => string} */
const dim = (text) => (useColor ? `\x1b[2m${text}\x1b[0m` : text)

/**
 * Runs a command and captures stdout. Uses execFile semantics so arguments are
 * never interpreted by a shell.
 *
 * @param {string} file
 * @param {string[]} args
 * @returns {string}
 */
function capture(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    throw new Error(`Command failed: ${file} ${args.join(' ')}`, {
      cause: error,
    })
  }
}

/**
 * Runs a command with inherited stdio so the user sees git and gh progress.
 *
 * @param {string} file
 * @param {string[]} args
 */
function runInherit(file, args) {
  const result = spawnSync(file, args, { stdio: 'inherit' })

  if (result.error != null) {
    throw new Error(`Command failed: ${file} ${args.join(' ')}`, {
      cause: result.error,
    })
  }

  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status}: ${file} ${args.join(' ')}`
    )
  }
}

/**
 * @param {string[]} argv
 * @returns {{ prNumber: number, dryRun: boolean }}
 */
function parseArgs(argv) {
  const positional = []
  let dryRun = false

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/adopt-pr.js <pr-number> [--dry-run]\n\n' +
          'Adopts a fork pull request into ' +
          REPO +
          ' so deploy tests can run.\n' +
          '  --dry-run   Report what would happen without pushing or opening a PR.'
      )
      process.exit(0)
    } else if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  if (positional.length !== 1) {
    throw new UsageError(
      `Expected exactly one argument (the PR number), received ${positional.length}.\n` +
        'Usage: node scripts/adopt-pr.js <pr-number> [--dry-run]'
    )
  }

  if (!/^\d+$/.test(positional[0])) {
    throw new UsageError(
      `PR number must be a positive integer: ${positional[0]}`
    )
  }

  return { prNumber: Number(positional[0]), dryRun }
}

/**
 * Resolves the remote that points at vercel/next.js rather than assuming a
 * name. A maintainer clone usually has it as `origin`; a fork-based clone has
 * it as `upstream`.
 *
 * @returns {string}
 */
function detectUpstreamRemote() {
  const output = capture('git', ['remote', '-v'])
  /** @type {string[]} */
  const matches = []

  for (const line of output.split('\n')) {
    const parsed = line.match(/^(\S+)\s+(\S+)\s+\(push\)$/)

    if (parsed === null) {
      continue
    }

    const [, name, url] = parsed

    // The `[:/]` separator and the `.git` strip keep `vercel/next-js-mirror`
    // and a `notvercel/next.js` lookalike from matching. Handles the `git@`,
    // `https://`, and `ssh://` URL forms.
    if (/[:/]vercel\/next\.js$/.test(url.replace(/\.git$/, ''))) {
      matches.push(name)
    }
  }

  if (matches.length === 0) {
    throw new UsageError(
      `No git remote points at ${REPO}. Add one before adopting:\n` +
        `  git remote add upstream git@github.com:${REPO}.git`
    )
  }

  for (const preferred of ['upstream', 'origin']) {
    if (matches.includes(preferred)) {
      return preferred
    }
  }

  return matches[0]
}

/**
 * Every file the PR touches.
 *
 * `gh pr view --json files` silently caps at 100 entries, which would present a
 * truncated list as though it were the whole surface. This endpoint paginates,
 * so it returns everything GitHub will disclose. GitHub itself stops at 3000
 * files, which the caller reports against `changedFiles` rather than hiding.
 *
 * @param {number} prNumber
 * @returns {string[]}
 */
function fetchChangedFiles(prNumber) {
  const output = capture('gh', [
    'api',
    '--paginate',
    `repos/${REPO}/pulls/${prNumber}/files`,
    '--jq',
    '.[].filename',
  ])

  if (output.length === 0) {
    return []
  }

  return output.split('\n')
}

/**
 * @param {number} prNumber
 */
function fetchPullRequest(prNumber) {
  const fields = [
    'number',
    'title',
    'body',
    'url',
    'state',
    'isDraft',
    'isCrossRepository',
    'author',
    'headRefName',
    'headRepositoryOwner',
    'baseRefName',
    'changedFiles',
    'additions',
    'deletions',
    'commits',
  ].join(',')

  const raw = capture('gh', [
    'pr',
    'view',
    String(prNumber),
    '--repo',
    REPO,
    '--json',
    fields,
  ])

  /** @type {any} */
  let pr

  try {
    pr = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Could not parse PR #${prNumber} metadata as JSON`, {
      cause: error,
    })
  }

  // Not available through `gh pr view --json`, and worth surfacing: a
  // FIRST_TIME_CONTRIBUTOR warrants more scrutiny than a MEMBER.
  const association = capture('gh', [
    'api',
    `repos/${REPO}/pulls/${prNumber}`,
    '--jq',
    '.author_association',
  ])

  return {
    number: pr.number,
    title: pr.title,
    body: typeof pr.body === 'string' ? pr.body : '',
    url: pr.url,
    state: pr.state,
    isDraft: pr.isDraft === true,
    isCrossRepository: pr.isCrossRepository === true,
    author: pr.author?.login ?? null,
    headRef: pr.headRefName,
    headOwner: pr.headRepositoryOwner?.login ?? null,
    baseRef: pr.baseRefName,
    changedFiles: pr.changedFiles,
    additions: pr.additions,
    deletions: pr.deletions,
    commitCount: Array.isArray(pr.commits) ? pr.commits.length : 0,
    files: fetchChangedFiles(prNumber),
    association,
  }
}

/**
 * Refuses to proceed on states where adoption is wrong or would clobber work,
 * before anything mutates.
 *
 * @param {ReturnType<typeof fetchPullRequest>} pr
 * @param {string} branch
 * @param {boolean} dryRun
 */
function preflight(pr, branch, dryRun) {
  // Draft and closed PRs are adoptable and only get their status reported.
  // Merged is different: the commits are already in the base branch.
  if (pr.state === 'MERGED') {
    throw new UsageError(
      `PR #${pr.number} is already merged, so its commits are in ` +
        `${BASE_BRANCH}. There is nothing to adopt.`
    )
  }

  if (!pr.isCrossRepository) {
    throw new UsageError(
      `PR #${pr.number} already targets a branch inside ${REPO}, so deploy ` +
        'tests already run on it. There is nothing to adopt.'
    )
  }

  if (pr.author === null) {
    throw new UsageError(
      `PR #${pr.number} has no author (the account may be deleted). Adopt it ` +
        'manually so you can decide who to attribute it to.'
    )
  }

  if (dryRun) {
    return
  }

  const dirty = capture('git', ['status', '--porcelain'])
    .split('\n')
    .filter((line) => line.length > 0 && !line.startsWith('??'))

  if (dirty.length > 0) {
    throw new UsageError(
      'Working tree has uncommitted changes to tracked files. Adopting ' +
        'switches branches, so commit or stash them first:\n' +
        dirty.map((line) => `  ${line}`).join('\n')
    )
  }

  const existing = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    { stdio: 'ignore' }
  )

  if (existing.status === 0) {
    throw new UsageError(
      `Local branch ${branch} already exists. Delete it to re-adopt from ` +
        `scratch:\n  git branch -D ${branch}`
    )
  }
}

/**
 * A draft is still `state: OPEN` on the API, so the two have to be combined to
 * describe what the adopter is actually looking at.
 *
 * Draft and closed PRs are both adoptable: a contributor may have marked it
 * draft while iterating, or closed it after going unreviewed. The status is
 * surfaced rather than enforced, so the decision stays with the adopter.
 *
 * @param {ReturnType<typeof fetchPullRequest>} pr
 * @returns {string}
 */
function describeStatus(pr) {
  if (pr.state === 'CLOSED') {
    return 'CLOSED (closed without merging, so the Closes line is a no-op)'
  }

  if (pr.isDraft === true) {
    return 'DRAFT'
  }

  return pr.state
}

/**
 * Highlights anything other than a plain open PR, so an adopter skimming the
 * header does not miss that the contributor closed it or is still iterating.
 *
 * @param {ReturnType<typeof fetchPullRequest>} pr
 * @returns {string}
 */
function formatStatus(pr) {
  const status = describeStatus(pr)

  return status === 'OPEN' ? status : yellow(bold(status))
}

/**
 * Lists the touched files. No attempt is made to rank or flag them: a payload
 * can sit in any test fixture or source file, so calling some paths "high risk"
 * would only imply the rest are safe.
 *
 * @param {ReturnType<typeof fetchPullRequest>} pr
 */
function printChangedFiles(pr) {
  console.log(bold(`  Files touched (${pr.files.length}):`))

  for (const file of pr.files) {
    console.log(`    ${file}`)
  }

  if (pr.files.length !== pr.changedFiles) {
    console.log('')
    console.log(
      red(
        `  GitHub returned ${pr.files.length} of ${pr.changedFiles} changed ` +
          `files. The list above is incomplete; review the diff on GitHub.`
      )
    )
  }
}

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * The gate that makes the adopter aware of what they are vouching for.
 *
 * A fork PR is denied secrets because the code is attacker-controlled. Pushing
 * it into vercel/next.js runs that same code on a trusted branch, with those
 * secrets available. Confirmation requires retyping the author's handle, so the
 * adopter has to look at who they are trusting rather than reflexively hitting
 * enter.
 *
 * @param {ReturnType<typeof fetchPullRequest>} pr
 * @param {string} remote
 * @param {string} branch
 * @returns {Promise<void>}
 */
async function confirmAdoption(pr, remote, branch) {
  console.log('')
  console.log(bold(`Adopting #${pr.number} - ${pr.title}`))
  console.log(`  Link      ${pr.url}`)
  console.log(`  Status    ${formatStatus(pr)}`)
  console.log(`  Author    @${pr.author} (${pr.association})`)
  console.log(`  Source    ${pr.headOwner}:${pr.headRef}`)
  console.log(
    `  Diff      ${pr.changedFiles} files, +${pr.additions} -${pr.deletions}, ` +
      `across ${pr.commitCount} commit(s)`
  )
  console.log(`  Push to   ${remote} (${REPO}) as ${branch}`)
  console.log('')

  printChangedFiles(pr)

  // The warning and the prompt come last, so a long file list scrolls them
  // toward the cursor instead of off the top of the terminal.
  console.log('')
  console.log(
    red(bold('  This grants the contributor code access to secrets.'))
  )
  console.log('')
  console.log(
    `  A fork PR is denied repository secrets because its code is not trusted.\n` +
      `  Adopting runs that same code on a branch inside ${REPO}, where CI has\n` +
      `  those secrets. Anything in this diff that executes during install,\n` +
      `  build, or test can read and exfiltrate them. The dangerous line does\n` +
      `  not have to be in the change the PR claims to make, and no file in the\n` +
      `  list above is safe by virtue of where it sits.`
  )
  console.log('')
  console.log(`  Read the full diff:  gh pr diff ${pr.number} --repo ${REPO}`)
  console.log('')

  if (process.stdin.isTTY !== true) {
    throw new UsageError(
      'Refusing to adopt without an interactive confirmation. Run this from a ' +
        'terminal, or use --dry-run for a non-interactive report.'
    )
  }

  const answer = await ask(
    `  Type the author's handle (${bold(String(pr.author))}) to confirm you ` +
      `have read\n  the full diff and vouch for this code: `
  )

  if (answer !== pr.author) {
    throw new UsageError(
      'Confirmation did not match the author handle. Aborted.'
    )
  }

  console.log('')
}

/**
 * Writes the replacement PR body: the contributor's description verbatim,
 * behind the line that links and closes the original.
 *
 * The description is deliberately copied rather than rewritten. It is the
 * contributor's own words, and any `Fixes #123` inside it has to survive,
 * because the original PR closes unmerged and so never fires its own.
 *
 * @param {ReturnType<typeof fetchPullRequest>} pr
 * @returns {string}
 */
function writeBodyFile(pr) {
  const header = `Adopts #${pr.number}. Closes #${pr.number}.`
  const body = pr.body.length > 0 ? `${header}\n\n${pr.body}\n` : `${header}\n`
  const file = path.join(os.tmpdir(), `adopt-pr-${pr.number}-body.md`)

  fs.writeFileSync(file, body, 'utf8')

  return file
}

async function main() {
  const { prNumber, dryRun } = parseArgs(process.argv.slice(2))
  const branch = `adopt/${prNumber}`

  const remote = detectUpstreamRemote()
  const pr = fetchPullRequest(prNumber)

  preflight(pr, branch, dryRun)

  if (dryRun) {
    console.log('')
    console.log(bold(`[dry run] Would adopt #${pr.number} - ${pr.title}`))
    console.log(`  Link      ${pr.url}`)
    console.log(`  Status    ${formatStatus(pr)}`)
    console.log(`  Author    @${pr.author} (${pr.association})`)
    console.log(`  Source    ${pr.headOwner}:${pr.headRef}`)
    console.log(
      `  Diff      ${pr.changedFiles} files, +${pr.additions} -${pr.deletions}, ` +
        `across ${pr.commitCount} commit(s)`
    )
    console.log(`  Remote    ${remote} (${REPO})`)
    console.log(`  Branch    ${branch} -> base ${BASE_BRANCH}`)
    console.log('')
    console.log(bold(`  Files touched (${pr.files.length}):`))
    for (const file of pr.files) {
      console.log(`    ${file}`)
    }
    console.log('')
    console.log(dim('  Body preview:'))
    console.log(
      `Adopts #${pr.number}. Closes #${pr.number}.`
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
    )
    console.log(dim(`    <${pr.body.length} bytes of the author's body>`))
    console.log('')
    return
  }

  await confirmAdoption(pr, remote, branch)

  const originalBranch = capture('git', ['branch', '--show-current'])

  console.log(bold(`Checking out #${pr.number} as ${branch}`))
  // Fetches refs/pull/<n>/head, so the fork does not need to be a remote. The
  // commits are not rewritten: authorship has to reach the merge intact.
  runInherit('gh', [
    'pr',
    'checkout',
    String(prNumber),
    '--repo',
    REPO,
    '-b',
    branch,
  ])

  try {
    console.log('')
    console.log(bold(`Pushing ${branch} to ${remote}`))
    runInherit('git', ['push', '-u', remote, branch])

    console.log('')
    console.log(bold('Opening the replacement pull request'))
    const bodyFile = writeBodyFile(pr)
    const url = capture('gh', [
      'pr',
      'create',
      '--draft',
      '--repo',
      REPO,
      '--base',
      BASE_BRANCH,
      '--head',
      branch,
      '--title',
      pr.title,
      '--body-file',
      bodyFile,
    ])

    fs.rmSync(bodyFile, { force: true })

    console.log('')
    console.log(bold('Adopted.'))
    console.log(`  Original  ${pr.url}`)
    console.log(`  Adopted   ${url}`)
    console.log('')
    console.log(
      dim(
        `  Opened as a draft. Merging it into ${BASE_BRANCH} closes #${pr.number}.`
      )
    )
    console.log(
      dim(`  Return to your previous branch: git checkout ${originalBranch}`)
    )
  } catch (error) {
    console.error('')
    console.error(
      red(
        `Adoption failed after checkout. You are on ${branch}; you were on ${originalBranch}.`
      )
    )
    throw error
  }
}

main().catch((error) => {
  console.error('')

  if (error instanceof UsageError) {
    console.error(red(error.message))
  } else {
    console.error(red(bold('adopt-pr failed')))
    console.error(error)
  }

  process.exit(1)
})
