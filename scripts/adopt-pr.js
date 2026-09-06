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

/** An empty directory, used as `core.hooksPath` for every subprocess. */
const NO_HOOKS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-pr-nohooks-'))

/**
 * Environment that stops any repository hook from running.
 *
 * `.husky/*` hook scripts are tracked, so a PR can add `.husky/post-checkout`
 * or edit `.husky/pre-commit`, and husky's shim runs `.husky/<hook>` out of the
 * working tree. Checking the branch out, re-signing it (`rebase --exec` runs
 * `git commit`, which fires `pre-commit`) and pushing it would each execute
 * contributor code on this machine.
 *
 * Git reads these variables, and every git subprocess inherits them, including
 * the ones `gh` and `git rebase --exec` spawn. Appending to any existing
 * `GIT_CONFIG_COUNT` keeps a caller's own injected config intact.
 *
 * The current environment is carried over explicitly. execa would do that
 * anyway through `extendEnv`, but spelling it out keeps the result a real
 * `ProcessEnv`, which this repo declares `NODE_ENV` as required on.
 *
 * @returns {NodeJS.ProcessEnv}
 */
function buildNoHooksEnv() {
  const declared = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? '0', 10)
  const index = Number.isNaN(declared) ? 0 : declared

  return {
    ...process.env,
    GIT_CONFIG_COUNT: String(index + 1),
    [`GIT_CONFIG_KEY_${index}`]: 'core.hooksPath',
    [`GIT_CONFIG_VALUE_${index}`]: NO_HOOKS_DIR,
  }
}

const SUBPROCESS_ENV = buildNoHooksEnv()

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
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<string>}
 */
async function capture(file, args, options = {}) {
  const { stdout } = await execa(file, args, {
    maxBuffer: 32 * 1024 * 1024,
    env: SUBPROCESS_ENV,
    ...options,
  })

  return stdout.trim()
}

/**
 * Runs a command with inherited stdio so the user sees git and gh progress.
 *
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<void>}
 */
async function runInherit(file, args, options = {}) {
  await execa(file, args, {
    stdio: 'inherit',
    env: SUBPROCESS_ENV,
    ...options,
  })
}

/**
 * Runs a command that is allowed to fail and reports its exit code.
 *
 * This exists so that every subprocess in this file goes through one of the
 * three helpers above, all of which pass SUBPROCESS_ENV. A call site that
 * reached for `execa` directly to get `reject: false` would silently opt out of
 * hook suppression, so there is deliberately no reason to call `execa` here.
 *
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<number | null>}
 */
async function runAllowingFailure(file, args, options = {}) {
  const result = await execa(file, args, {
    env: SUBPROCESS_ENV,
    reject: false,
    ...options,
  })

  return result.exitCode ?? null
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
    'headRefOid',
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
    headOid: pr.headRefOid,
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

  // The working tree is deliberately not inspected. Everything happens in a
  // throwaway worktree, so the maintainer's checkout is never switched and can
  // stay as dirty as they like.
  const existing = await runAllowingFailure('git', [
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ])

  if (existing === 0) {
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
  console.log(`  Head      ${pr.headOid}`)
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
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
async function findUnsignedCommits(range, cwd) {
  const log = await capture('git', ['log', '--format=%H', range], { cwd })

  if (log.length === 0) {
    return []
  }

  const unsigned = []

  for (const sha of log.split('\n')) {
    const raw = await capture('git', ['cat-file', 'commit', sha], { cwd })
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
 * @param {string} baseOid
 * @param {string} cwd
 * @returns {Promise<void>}
 */
async function signCommits(baseOid, cwd) {
  const mergeBase = await capture('git', ['merge-base', 'HEAD', baseOid], {
    cwd,
  })
  const unsigned = await findUnsignedCommits(`${mergeBase}..HEAD`, cwd)

  if (unsigned.length === 0) {
    console.log(dim('  All commits are already signed.'))
    return
  }

  console.log(
    `  ${unsigned.length} unsigned commit(s); re-signing so the branch can merge.`
  )

  const headBefore = await capture('git', ['rev-parse', 'HEAD'], { cwd })
  const treeBefore = await capture('git', ['rev-parse', 'HEAD^{tree}'], { cwd })

  try {
    await runInherit(
      'git',
      [
        'rebase',
        '--rebase-merges',
        '--exec',
        'git commit --amend --no-edit -S',
        mergeBase,
      ],
      { cwd }
    )
  } catch (error) {
    await runAllowingFailure('git', ['rebase', '--abort'], { cwd })

    throw new Error(
      'Could not re-sign the commits. Check that commit signing works ' +
        '(`git config commit.gpgsign` and `user.signingkey`), then retry.',
      { cause: error }
    )
  }

  const treeAfter = await capture('git', ['rev-parse', 'HEAD^{tree}'], { cwd })

  if (treeAfter !== treeBefore) {
    await runInherit('git', ['reset', '--hard', headBefore], { cwd })

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
    console.log(`  Head      ${pr.headOid}`)
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

  // Starting the worktree from the PR's base keeps the checkout small and
  // gives signCommits its merge-base without a second fetch.
  await runInherit('git', ['fetch', '--no-tags', remote, pr.baseRef])
  const baseOid = await capture('git', ['rev-parse', 'FETCH_HEAD'])

  const tmpRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `adopt-pr-${prNumber}-`)
  )
  const workdir = path.join(tmpRoot, 'checkout')
  let branchCreated = false

  try {
    console.log(bold('Creating a throwaway worktree'))
    // The contributor's files, and any half-finished rebase, stay in here. The
    // maintainer's checkout is never switched or dirtied.
    await runInherit('git', ['worktree', 'add', '--detach', workdir, baseOid])

    console.log('')
    console.log(bold(`Checking out #${pr.number} as ${branch}`))
    // Fetches refs/pull/<n>/head, so the fork does not need to be a remote. The
    // commits are not rewritten: authorship has to reach the merge intact.
    await runInherit(
      'gh',
      ['pr', 'checkout', String(prNumber), '--repo', REPO, '-b', branch],
      { cwd: workdir }
    )
    branchCreated = true

    // The adopter vouched for one specific commit. If the contributor pushed
    // between that review and this fetch, what is on disk is not what was
    // approved, and pushing it would grant unreviewed code access to secrets.
    const checkedOut = await capture('git', ['rev-parse', 'HEAD'], {
      cwd: workdir,
    })

    if (checkedOut !== pr.headOid) {
      throw new Error(
        `PR #${prNumber} changed while it was being reviewed.\n` +
          `  Reviewed: ${pr.headOid}\n` +
          `  Fetched:  ${checkedOut}\n` +
          'Nothing was pushed. Re-run to review the new commits.'
      )
    }

    console.log('')
    console.log(bold('Checking commit signatures'))
    await signCommits(baseOid, workdir)

    console.log('')
    console.log(bold(`Pushing ${branch} to ${remote}`))
    await runInherit('git', ['push', '-u', remote, branch], { cwd: workdir })

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
    console.log(dim(`  ${remote}/${branch} holds the adopted commits.`))
  } finally {
    // Runs on success and failure alike, so a rejected SHA or a failed rebase
    // leaves nothing behind. The branch lives on the remote now, and dropping
    // the local copy keeps a re-run from tripping the branch-exists check.
    await runAllowingFailure('git', ['worktree', 'remove', '--force', workdir])

    if (branchCreated) {
      await runAllowingFailure('git', ['branch', '-D', branch])
    }

    fs.rmSync(tmpRoot, { recursive: true, force: true })
    fs.rmSync(NO_HOOKS_DIR, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('')
  console.error(red(bold('adopt-pr failed')))
  console.error(error)
  process.exit(1)
})
