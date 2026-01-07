// @ts-check
import fs from 'fs/promises'
import execa from 'execa'
import path from 'path'
import { getDiffRevision, getGitInfo } from './git-info.mjs'

/**
 * Detects changed tests files by comparing the current branch with `origin/canary`
 * Returns tests separated by test mode (dev/prod), as well as the corresponding commit hash
 * that the current branch is pointing to
 */
export default async function getChangedTests() {
  /** @type import('execa').Options */
  const EXECA_OPTS = { shell: true }

  const { branchName, remoteUrl, commitSha, isCanary } = await getGitInfo()

  if (isCanary) {
    console.log(`Skipping flake detection for canary`)
    return { devTests: [], prodTests: [] }
  }

  const diffRevision = await getDiffRevision()

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
      if (
        file.startsWith('test/e2e/') ||
        file.startsWith('test/integration/')
      ) {
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
