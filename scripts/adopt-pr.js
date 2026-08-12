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
 *   pnpm pr-adopt <pr-number>
 */

const execa = require('execa')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')

const REPO = 'vercel/next.js'

/**
 * Only used to highlight an unusual base in the summary. The adopted PR always
 * inherits the original's base branch rather than defaulting to this one.
 */
const DEFAULT_BRANCH = 'canary'

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
 * Runs a command and returns its trimmed stdout. Arguments are passed as an
 * array, so nothing is interpreted by a shell.
 *
 * @param {string} file
 * @param {string[]} args
 * @returns {Promise<string>}
 */
async function capture(file, args) {
  const { stdout } = await execa(file, args, {
    maxBuffer: 32 * 1024 * 1024,
  })

  return stdout.trim()
}

/**
 * Runs a command with inherited stdio so the user sees git and gh progress.
 *
 * @param {string} file
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function runInherit(file, args) {
  await execa(file, args, { stdio: 'inherit' })
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
      throw new Error(`Unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  if (positional.length !== 1) {
    throw new Error(
      `Expected exactly one argument (the PR number), received ${positional.length}.\n` +
        'Usage: node scripts/adopt-pr.js <pr-number> [--dry-run]'
    )
  }

  if (!/^\d+$/.test(positional[0])) {
    throw new Error(`PR number must be a positive integer: ${positional[0]}`)
  }

  return { prNumber: Number(positional[0]), dryRun }
}

/**
 * Resolves the remote that points at vercel/next.js rather than assuming a
 * name. A maintainer clone usually has it as `origin`; a fork-based clone has
 * it as `upstream`.
 *
 * @returns {Promise<string>}
 */
async function detectUpstreamRemote() {
  const output = await capture('git', ['remote', '-v'])
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
    throw new Error(
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
 * @returns {Promise<string[]>}
 */
async function fetchChangedFiles(prNumber) {
  const output = await capture('gh', [
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
async function fetchPullRequest(prNumber) {
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

  const raw = await capture('gh', [
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
  const association = await capture('gh', [
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
    files: await fetchChangedFiles(prNumber),
    association,
  }
}

/**
 * Refuses to proceed on states where adoption is wrong or would clobber work,
 * before anything mutates.
 *
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
 * @param {string} branch
 * @param {boolean} dryRun
 * @returns {Promise<void>}
 */
async function preflight(pr, branch, dryRun) {
  // Draft and closed PRs are adoptable and only get their status reported.
  // Merged is different: the commits are already in the base branch.
  if (pr.state === 'MERGED') {
    throw new Error(
      `PR #${pr.number} is already merged, so its commits are in ` +
        `${pr.baseRef}. There is nothing to adopt.`
    )
  }

  if (!pr.isCrossRepository) {
    throw new Error(
      `PR #${pr.number} already targets a branch inside ${REPO}, so deploy ` +
        'tests already run on it. There is nothing to adopt.'
    )
  }

  if (pr.author === null) {
    throw new Error(
      `PR #${pr.number} has no author (the account may be deleted). Adopt it ` +
        'manually so you can decide who to attribute it to.'
    )
  }

  if (dryRun) {
    return
  }

  const status = await capture('git', ['status', '--porcelain'])
  const dirty = status
    .split('\n')
    .filter((line) => line.length > 0 && !line.startsWith('??'))

  if (dirty.length > 0) {
    throw new Error(
      'Working tree has uncommitted changes to tracked files. Adopting ' +
        'switches branches, so commit or stash them first:\n' +
        dirty.map((line) => `  ${line}`).join('\n')
    )
  }

  const existing = await execa(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    { reject: false }
  )

  if (existing.exitCode === 0) {
    throw new Error(
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
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
 * @returns {string}
 */
function describeStatus(pr) {
  if (pr.state === 'CLOSED') {
    return 'CLOSED (closed without merging)'
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
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
 * @returns {string}
 */
function formatStatus(pr) {
  const status = describeStatus(pr)

  return status === 'OPEN' ? status : yellow(bold(status))
}

/**
 * The adopted PR inherits the original's base branch. An unusual base is
 * highlighted because retargeting, say, a release-branch fix at canary would
 * change what the change means.
 *
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
 * @returns {string}
 */
function formatBase(pr) {
  if (pr.baseRef === DEFAULT_BRANCH) {
    return pr.baseRef
  }

  return yellow(bold(`${pr.baseRef} (not the default branch)`))
}

/**
 * Lists the touched files. No attempt is made to rank or flag them: a payload
 * can sit in any test fixture or source file, so calling some paths "high risk"
 * would only imply the rest are safe.
 *
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
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
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
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
  console.log(`  Base      ${formatBase(pr)}`)
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
    throw new Error(
      'Refusing to adopt without an interactive confirmation. Run this from a ' +
        'terminal, or use --dry-run for a non-interactive report.'
    )
  }

  const answer = await ask(
    `  Type the author's handle (${bold(String(pr.author))}) to confirm you ` +
      `have read\n  the full diff and vouch for this code: `
  )

  if (answer !== pr.author) {
    throw new Error('Confirmation did not match the author handle. Aborted.')
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
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
 * @returns {string}
 */
function writeBodyFile(pr) {
  const header = `Adopts #${pr.number}. Closes #${pr.number}.`
  const body = pr.body.length > 0 ? `${header}\n\n${pr.body}\n` : `${header}\n`
  const file = path.join(os.tmpdir(), `adopt-pr-${pr.number}-body.md`)

  fs.writeFileSync(file, body, 'utf8')

  return file
}

/**
 * Commits whose raw object carries no signature header.
 *
 * `%G?` reports whether a signature *verifies*, not whether one exists. With
 * SSH signing and no `gpg.ssh.allowedSignersFile`, git cannot verify locally
 * and reports `N` for every commit, including ones it just signed itself, and
 * including GitHub's own signed merge commits. Reading the object headers
 * answers the question actually being asked.
 *
 * @param {string} range
 * @returns {Promise<string[]>}
 */
async function findUnsignedCommits(range) {
  const log = await capture('git', ['log', '--format=%H', range])

  if (log.length === 0) {
    return []
  }

  const unsigned = []

  for (const sha of log.split('\n')) {
    const raw = await capture('git', ['cat-file', 'commit', sha])
    const lines = raw.split('\n')
    const headerEnd = lines.indexOf('')
    const headers = headerEnd === -1 ? lines : lines.slice(0, headerEnd)

    if (!headers.some((line) => line.startsWith('gpgsig'))) {
      unsigned.push(sha)
    }
  }

  return unsigned
}

/**
 * Re-signs the branch when any commit arrives unsigned, which contributor
 * commits usually do. Protected branches require verified signatures, so an
 * unsigned branch cannot merge.
 *
 * Signing rewrites commits, so this preserves each `Author` (only the committer
 * and the SHAs change) and verifies afterwards that the tree is byte-identical.
 * Re-signing must never alter content, and `--rebase-merges` is not trusted to
 * be content-preserving on faith.
 *
 * @param {Awaited<ReturnType<typeof fetchPullRequest>>} pr
 * @param {string} remote
 * @returns {Promise<void>}
 */
async function signCommits(pr, remote) {
  await runInherit('git', ['fetch', remote, pr.baseRef])

  const mergeBase = await capture('git', ['merge-base', 'HEAD', 'FETCH_HEAD'])
  const unsigned = await findUnsignedCommits(`${mergeBase}..HEAD`)

  if (unsigned.length === 0) {
    console.log(dim('  All commits are already signed.'))
    return
  }

  console.log(
    `  ${unsigned.length} unsigned commit(s); re-signing so the branch can merge.`
  )

  const headBefore = await capture('git', ['rev-parse', 'HEAD'])
  const treeBefore = await capture('git', ['rev-parse', 'HEAD^{tree}'])

  try {
    await runInherit('git', [
      'rebase',
      '--rebase-merges',
      '--exec',
      'git commit --amend --no-edit -S',
      mergeBase,
    ])
  } catch (error) {
    await execa('git', ['rebase', '--abort'], { reject: false })

    throw new Error(
      'Could not re-sign the commits. Check that commit signing works ' +
        '(`git config commit.gpgsign` and `user.signingkey`), then retry.',
      { cause: error }
    )
  }

  const treeAfter = await capture('git', ['rev-parse', 'HEAD^{tree}'])

  if (treeAfter !== treeBefore) {
    await runInherit('git', ['reset', '--hard', headBefore])

    throw new Error(
      'Re-signing changed the tree, so it was reset. Sign the commits by ' +
        'hand and verify the diff before pushing.'
    )
  }

  console.log(dim('  Re-signed. Authors preserved, tree unchanged.'))
}

async function main() {
  const { prNumber, dryRun } = parseArgs(process.argv.slice(2))
  const branch = `adopt/${prNumber}`

  const remote = await detectUpstreamRemote()
  const pr = await fetchPullRequest(prNumber)

  await preflight(pr, branch, dryRun)

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
    console.log(`  Branch    ${branch}`)
    console.log(`  Base      ${formatBase(pr)}`)
    console.log('')
    printChangedFiles(pr)
    console.log('')
    console.log(dim('  Body preview:'))
    console.log(`    Adopts #${pr.number}. Closes #${pr.number}.`)
    console.log(dim(`    <${pr.body.length} bytes of the author's body>`))
    console.log('')
    return
  }

  await confirmAdoption(pr, remote, branch)

  const originalBranch = await capture('git', ['branch', '--show-current'])

  console.log(bold(`Checking out #${pr.number} as ${branch}`))
  // Fetches refs/pull/<n>/head, so the fork does not need to be a remote. The
  // commits are not rewritten: authorship has to reach the merge intact.
  await runInherit('gh', [
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
    console.log(bold('Checking commit signatures'))
    await signCommits(pr, remote)

    console.log('')
    console.log(bold(`Pushing ${branch} to ${remote}`))
    await runInherit('git', ['push', '-u', remote, branch])

    console.log('')
    console.log(bold('Opening the replacement pull request'))
    const bodyFile = writeBodyFile(pr)
    const url = await capture('gh', [
      'pr',
      'create',
      '--draft',
      '--repo',
      REPO,
      // The contributor's own base, never a hard-coded default: retargeting a
      // release-branch fix at canary would change what the change means.
      '--base',
      pr.baseRef,
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
    console.log(dim(`  Opened as a draft against ${pr.baseRef}.`))
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
  console.error(red(bold('adopt-pr failed')))
  console.error(error)
  process.exit(1)
})
