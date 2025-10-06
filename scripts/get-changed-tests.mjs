// @ts-check
import fs from 'fs/promises'
import execa from 'execa'
import path from 'path'

/**
 * Detects changed tests files by comparing the current branch with `origin/canary`
 * Returns tests separated by test mode (dev/prod), as well as the corresponding commit hash
 * that the current branch is pointing to
 */
export default async function getChangedTests() {
  let eventData = {}

  /** @type import('execa').Options */
  const EXECA_OPTS = { shell: true }
  /** @type import('execa').Options */
  const EXECA_OPTS_STDIO = { ...EXECA_OPTS, stdio: 'inherit' }

  try {
    eventData =
      JSON.parse(
        await fs.readFile(process.env.GITHUB_EVENT_PATH || '', 'utf8')
      )['pull_request'] || {}
  } catch (_) {}

  const branchName =
    eventData?.head?.ref ||
    process.env.GITHUB_REF_NAME ||
    (await execa('git rev-parse --abbrev-ref HEAD', EXECA_OPTS)).stdout

  const remoteUrl =
    eventData?.head?.repo?.full_name ||
    process.env.GITHUB_REPOSITORY ||
    (await execa('git remote get-url origin', EXECA_OPTS)).stdout

  const commitSha =
    eventData?.head?.sha ||
    process.env.GITHUB_SHA ||
    (await execa('git rev-parse HEAD', EXECA_OPTS)).stdout

  const isCanary =
    branchName.trim() === 'canary' && remoteUrl.includes('vercel/next.js')

  if (isCanary) {
    console.log(`Skipping flake detection for canary`)
    return { devTests: [], prodTests: [] }
  }

  let diffRevision
  if (
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_EVENT_NAME === 'pull_request'
  ) {
    // GH Actions for `pull_request` run on the merge commit so HEAD~1:
    // 1. includes all changes in the PR
    //    e.g. in
    //    A-B-C-main - F
    //     \          /
    //      D-E-branch
    //    GH actions for `branch` runs on F, so a diff for HEAD~1 includes the diff of D and E combined
    // 2. Includes all changes of the commit for pushes
    diffRevision = 'HEAD~1'
  } else {
    try {
      await execa(
        'git remote set-branches --add origin canary',
        EXECA_OPTS_STDIO
      )
      await execa('git fetch origin canary --depth=20', EXECA_OPTS_STDIO)
    } catch (err) {
      console.error(await execa('git remote -v', EXECA_OPTS_STDIO))
      console.error(`Failed to fetch origin/canary`, err)
    }
    // TODO: We should diff against the merge base with origin/canary not directly against origin/canary.
    // A --- B ---- origin/canary
    //  \
    //   \-- C ---- HEAD
    // `git diff origin/canary` includes B and C
    // But we should only include C.
    diffRevision = 'origin/canary'
  }

  const changesResult = await execa(
    `git diff ${diffRevision} --name-only`,
    EXECA_OPTS
  ).catch((err) => {
    console.error(err)
    return { stdout: '', stderr: '' }
  })
  console.log(
    {
      branchName,
      remoteUrl,
      isCanary,
      commitSha,
    },
    `\ngit diff:\n${changesResult.stderr}\n${changesResult.stdout}`
  )
  const changedFiles = changesResult.stdout.split('\n')

  // run each test 3 times in each test mode (if E2E) with no-retrying
  // and if any fail it's flakey
  const devTests = []
  const prodTests = []

  for (let file of changedFiles) {
    // normalize slashes
    file = file.replace(/\\/g, '/')
    const fileExists = await fs
      .access(path.join(process.cwd(), file), fs.constants.F_OK)
      .then(() => true)
      .catch(() => false)

    if (fileExists && file.match(/^test\/.*?\.test\.(js|ts|tsx)$/)) {
      if (file.startsWith('test/e2e/')) {
        devTests.push(file)
        prodTests.push(file)
      } else if (file.startsWith('test/prod')) {
        prodTests.push(file)
      } else if (file.startsWith('test/development')) {
        devTests.push(file)
      }
    }
  }

  console.log(
    'Detected tests:',
    JSON.stringify(
      {
        devTests,
        prodTests,
      },
      null,
      2
    )
  )

  return { devTests, prodTests, commitSha }
}
