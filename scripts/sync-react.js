// @ts-check

const path = require('path')
const fsp = require('fs/promises')
const process = require('process')
const execa = require('execa')
const { Octokit } = require('octokit')
const yargs = require('yargs')

/** @type {any} */
const fetch = require('node-fetch')

const repoOwner = 'vercel'
const repoName = 'next.js'
const pullRequestLabels = ['type: react-sync']
const pullRequestReviewers = ['eps1lon']
/**
 * Set to `null` to automatically sync the React version of Pages Router with App Router React version.
 * Set to a specific version to override the Pages Router React version e.g. `^19.0.0`.
 * @type {string | null}
 */
const pagesRouterReact = '^19.0.0'

const defaultLatestChannel = 'canary'
const filesReferencingReactPeerDependencyVersion = [
  'run-tests.js',
  'packages/create-next-app/templates/index.ts',
  'test/lib/next-modes/base.ts',
]
const libraryManifestsSupportingNextjsReact = [
  'packages/third-parties/package.json',
  'packages/next/package.json',
]
const appManifestsInstallingNextjsPeerDependencies = [
  'examples/reproduction-template/package.json',
  'test/.stats-app/package.json',
  // TODO: These should use the usual test helpers that automatically install the right React version
  'test/e2e/next-test/first-time-setup-js/package.json',
  'test/e2e/next-test/first-time-setup-ts/package.json',
]

async function getSchedulerVersion(reactVersion) {
  const url = `https://registry.npmjs.org/react-dom/${reactVersion}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(
      `${url}: ${response.status} ${response.statusText}\n${await response.text()}`
    )
  }

  const manifest = await response.json()

  return manifest.dependencies['scheduler']
}

// Use this script to update Next's vendored copy of React and related packages:
//
// Basic usage (defaults to most recent React canary version):
//   pnpm run sync-react
//
// Update package.json but skip installing the dependencies automatically:
//   pnpm run sync-react --no-install

async function sync({ channel, newVersionStr, noInstall }) {
  const useExperimental = channel === 'experimental'
  const cwd = process.cwd()
  const pkgJson = JSON.parse(
    await fsp.readFile(path.join(cwd, 'package.json'), 'utf-8')
  )
  const devDependencies = pkgJson.devDependencies
  const pnpmOverrides = pkgJson.pnpm.overrides
  const baseVersionStr = devDependencies[
    useExperimental ? 'react-experimental-builtin' : 'react-builtin'
  ].replace(/^npm:react@/, '')

  console.log(`Updating "react@${channel}" to ${newVersionStr}...`)
  if (newVersionStr === baseVersionStr) {
    console.log('Already up to date.')
    return
  }

  const baseSchedulerVersionStr = devDependencies[
    useExperimental ? 'scheduler-experimental-builtin' : 'scheduler-builtin'
  ].replace(/^npm:scheduler@/, '')
  const newSchedulerVersionStr = await getSchedulerVersion(newVersionStr)
  console.log(`Updating "scheduler@${channel}" to ${newSchedulerVersionStr}...`)

  for (const [dep, version] of Object.entries(devDependencies)) {
    if (version.endsWith(baseVersionStr)) {
      devDependencies[dep] = version.replace(baseVersionStr, newVersionStr)
    } else if (version.endsWith(baseSchedulerVersionStr)) {
      devDependencies[dep] = version.replace(
        baseSchedulerVersionStr,
        newSchedulerVersionStr
      )
    }
  }
  for (const [dep, version] of Object.entries(pnpmOverrides)) {
    if (version.endsWith(baseVersionStr)) {
      pnpmOverrides[dep] = version.replace(baseVersionStr, newVersionStr)
    } else if (version.endsWith(baseSchedulerVersionStr)) {
      pnpmOverrides[dep] = version.replace(
        baseSchedulerVersionStr,
        newSchedulerVersionStr
      )
    }
  }
  await fsp.writeFile(
    path.join(cwd, 'package.json'),
    JSON.stringify(pkgJson, null, 2) +
      // Prettier would add a newline anyway so do it manually to skip the additional `pnpm prettier-write`
      '\n'
  )
}

function extractInfoFromReactVersion(reactVersion) {
  const match = reactVersion.match(
    /(?<semverVersion>.*)-(?<releaseLabel>.*)-(?<sha>.*)-(?<dateString>.*)$/
  )
  return match ? match.groups : null
}

async function getChangelogFromGitHub(baseSha, newSha) {
  const pageSize = 50
  let changelog = []
  for (let currentPage = 1; ; currentPage++) {
    const url = `https://api.github.com/repos/facebook/react/compare/${baseSha}...${newSha}?per_page=${pageSize}&page=${currentPage}`
    const headers = {}
    // GITHUB_TOKEN is optional but helps in case of rate limiting during development.
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`
    }
    const response = await fetch(url, {
      headers,
    })
    if (!response.ok) {
      throw new Error(
        `${response.url}: Failed to fetch commit log from GitHub:\n${response.statusText}\n${await response.text()}`
      )
    }
    const data = await response.json()

    const { commits } = data
    for (const { commit, sha } of commits) {
      const title = commit.message.split('\n')[0] || ''
      const match =
        // The "title" looks like "[Fiber][Float] preinitialized stylesheets should support integrity option (#26881)"
        /\(#([0-9]+)\)$/.exec(title) ??
        // or contains "Pull Request resolved: https://github.com/facebook/react/pull/12345" in the body if merged via ghstack (e.g. https://github.com/facebook/react/commit/0a0a5c02f138b37e93d5d93341b494d0f5d52373)
        /^Pull Request resolved: https:\/\/github.com\/facebook\/react\/pull\/([0-9]+)$/m.exec(
          commit.message
        )
      const prNum = match ? match[1] : ''
      if (prNum) {
        changelog.push(`- https://github.com/facebook/react/pull/${prNum}`)
      } else {
        changelog.push(
          `- [${commit.message.split('\n')[0]} facebook/react@${sha.slice(0, 9)}](https://github.com/facebook/react/commit/${sha}) (${commit.author.name})`
        )
      }
    }

    if (commits.length < pageSize) {
      // If the number of commits is less than the page size, we've reached
      // the end. Otherwise we'll keep fetching until we run out.
      break
    }
  }

  changelog.reverse()

  return changelog.length > 0 ? changelog.join('\n') : null
}

async function main() {
  const cwd = process.cwd()
  const errors = []
  const argv = await yargs(process.argv.slice(2))
    .version(false)
    .options('actor', {
      type: 'string',
      description:
        'Required with `--create-pull`. The actor (GitHub username) that runs this script. Will be used for notifications but not commit attribution.',
    })
    .options('create-pull', {
      default: false,
      type: 'boolean',
      description: 'Create a Pull Request in vercel/next.js',
    })
    .options('commit', {
      default: false,
      type: 'boolean',
      description:
        'Creates commits for each intermediate step. Useful to create better diffs for GitHub.',
    })
    .options('install', { default: true, type: 'boolean' })
    .options('version', { default: null, type: 'string' }).argv
  const { actor, createPull, commit, install, version } = argv

  async function commitEverything(message) {
    await execa('git', ['add', '-A'])
    await execa('git', [
      'commit',
      '--message',
      message,
      '--no-verify',
      // Some steps can be empty, e.g. when we don't sync Pages router
      '--allow-empty',
    ])
  }

  if (createPull && !actor) {
    throw new Error(
      `Pull Request cannot be created without a GitHub actor (received '${String(actor)}'). ` +
        'Pass an actor via `--actor "some-actor"`.'
    )
  }
  const githubToken = process.env.GITHUB_TOKEN
  if (createPull && !githubToken) {
    throw new Error(
      `Environment variable 'GITHUB_TOKEN' not specified but required when --create-pull is specified.`
    )
  }

  let newVersionStr = version
  if (
    newVersionStr === null ||
    // TODO: Fork arguments in GitHub workflow to ensure `--version ""` is considered a mistake
    newVersionStr === ''
  ) {
    const { stdout, stderr } = await execa(
      'npm',
      ['--silent', 'view', `react@${defaultLatestChannel}`, 'version'],
      {
        // Avoid "Usage Error: This project is configured to use pnpm".
        cwd: '/tmp',
      }
    )
    if (stderr) {
      console.error(stderr)
      throw new Error('Failed to read latest React canary version from npm.')
    }
    newVersionStr = stdout.trim()
    console.log(
      `--version was not provided. Using react@${defaultLatestChannel}: ${newVersionStr}`
    )
  }

  const newVersionInfo = extractInfoFromReactVersion(newVersionStr)
  if (!newVersionInfo) {
    throw new Error(
      `New react version does not match expected format: ${newVersionStr}

Choose a React canary version from npm: https://www.npmjs.com/package/react?activeTab=versions

Or, run this command with no arguments to use the most recently published version.
`
    )
  }
  const { sha: newSha, dateString: newDateString } = newVersionInfo

  const branchName = `update/react/${newVersionStr}`
  if (createPull) {
    const { exitCode, all, command } = await execa(
      'git',
      [
        'ls-remote',
        '--exit-code',
        '--heads',
        'origin',
        `refs/heads/${branchName}`,
      ],
      { reject: false }
    )

    if (exitCode === 2) {
      console.log(
        `No sync in progress in branch '${branchName}' according to '${command}'. Starting a new one.`
      )
    } else if (exitCode === 0) {
      console.log(
        `An existing sync already exists in branch '${branchName}'. Delete the branch to start a new sync.`
      )
      return
    } else {
      throw new Error(
        `Failed to check if the branch already existed:\n${command}: ${all}`
      )
    }
  }

  const rootManifest = JSON.parse(
    await fsp.readFile(path.join(cwd, 'package.json'), 'utf-8')
  )
  const baseVersionStr = rootManifest.devDependencies['react-builtin'].replace(
    /^npm:react@/,
    ''
  )

  await sync({
    newVersionStr: `0.0.0-experimental-${newSha}-${newDateString}`,
    noInstall: !install,
    channel: 'experimental',
  })
  if (commit) {
    await commitEverything('Update `react@experimental`')
  }
  await sync({
    newVersionStr,
    noInstall: !install,
    channel: '<framework-stable>',
  })
  if (commit) {
    await commitEverything('Update `react`')
  }

  const baseVersionInfo = extractInfoFromReactVersion(baseVersionStr)
  if (!baseVersionInfo) {
    throw new Error(
      'Base react version does not match expected format: ' + baseVersionStr
    )
  }

  const syncPagesRouterReact = pagesRouterReact === null
  const pagesRouterReactVersion = syncPagesRouterReact
    ? newVersionStr
    : pagesRouterReact
  const { sha: baseSha, dateString: baseDateString } = baseVersionInfo

  if (syncPagesRouterReact) {
    for (const fileName of filesReferencingReactPeerDependencyVersion) {
      const filePath = path.join(cwd, fileName)
      const previousSource = await fsp.readFile(filePath, 'utf-8')
      const updatedSource = previousSource.replace(
        `const nextjsReactPeerVersion = "${baseVersionStr}";`,
        `const nextjsReactPeerVersion = "${pagesRouterReactVersion}";`
      )
      if (pagesRouterReact === null && updatedSource === previousSource) {
        errors.push(
          new Error(
            `${fileName}: Failed to update ${baseVersionStr} to ${pagesRouterReactVersion}. Is this file still referencing the React peer dependency version?`
          )
        )
      } else {
        await fsp.writeFile(filePath, updatedSource)
      }
    }
  }

  for (const fileName of appManifestsInstallingNextjsPeerDependencies) {
    const packageJsonPath = path.join(cwd, fileName)
    const packageJson = await fsp.readFile(packageJsonPath, 'utf-8')
    const manifest = JSON.parse(packageJson)
    if (manifest.dependencies['react']) {
      manifest.dependencies['react'] = pagesRouterReactVersion
    }
    if (manifest.dependencies['react-dom']) {
      manifest.dependencies['react-dom'] = pagesRouterReactVersion
    }
    await fsp.writeFile(
      packageJsonPath,
      JSON.stringify(manifest, null, 2) +
        // Prettier would add a newline anyway so do it manually to skip the additional `pnpm prettier-write`
        '\n'
    )
  }

  if (commit) {
    await commitEverything('Updated peer dependency references in apps')
  }

  for (const fileName of libraryManifestsSupportingNextjsReact) {
    const packageJsonPath = path.join(cwd, fileName)
    const packageJson = await fsp.readFile(packageJsonPath, 'utf-8')
    const manifest = JSON.parse(packageJson)
    // Need to specify last supported RC version to avoid breaking changes.
    if (manifest.peerDependencies['react']) {
      manifest.peerDependencies['react'] =
        `^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ${pagesRouterReactVersion}`
    }
    if (manifest.peerDependencies['react-dom']) {
      manifest.peerDependencies['react-dom'] =
        `^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ${pagesRouterReactVersion}`
    }
    await fsp.writeFile(
      packageJsonPath,
      JSON.stringify(manifest, null, 2) +
        // Prettier would add a newline anyway so do it manually to skip the additional `pnpm prettier-write`
        '\n'
    )
  }

  if (commit) {
    await commitEverything('Updated peer dependency references in libraries')
  }

  // Install the updated dependencies and build the vendored React files.
  if (!install) {
    console.log('Skipping install step because --no-install flag was passed.')
  } else {
    console.log('Installing dependencies...')

    const installSubprocess = execa('pnpm', [
      'install',
      // Pnpm freezes the lockfile by default in CI.
      // However, we just changed versions so the lockfile is expected to be changed.
      '--no-frozen-lockfile',
    ])
    if (installSubprocess.stdout) {
      installSubprocess.stdout.pipe(process.stdout)
    }
    try {
      await installSubprocess
    } catch (error) {
      console.error(error)
      throw new Error('Failed to install updated dependencies.')
    }

    if (commit) {
      await commitEverything('Update lockfile')
    }

    console.log('Building vendored React files...\n')
    const nccSubprocess = execa('pnpm', ['ncc-compiled'], {
      cwd: path.join(cwd, 'packages', 'next'),
    })
    if (nccSubprocess.stdout) {
      nccSubprocess.stdout.pipe(process.stdout)
    }
    try {
      await nccSubprocess
    } catch (error) {
      console.error(error)
      throw new Error('Failed to run ncc.')
    }

    if (commit) {
      await commitEverything('ncc-compiled')
    }

    // Print extra newline after ncc output
    console.log()
  }

  let prDescription = ''
  if (syncPagesRouterReact) {
    prDescription += `**breaking change for canary users: Bumps peer dependency of React from \`${baseVersionStr}\` to \`${pagesRouterReactVersion}\`**\n\n`
  }

  // Fetch the changelog from GitHub and print it to the console.
  prDescription += `[diff facebook/react@${baseSha}...${newSha}](https://github.com/facebook/react/compare/${baseSha}...${newSha})\n\n`
  try {
    const changelog = await getChangelogFromGitHub(baseSha, newSha)
    if (changelog === null) {
      prDescription += `GitHub reported no changes between ${baseSha} and ${newSha}.`
    } else {
      prDescription += `<details>\n<summary>React upstream changes</summary>\n\n${changelog}\n\n</details>`
    }
  } catch (error) {
    console.error(error)
    prDescription +=
      '\nFailed to fetch changelog from GitHub. Changes were applied, anyway.\n'
  }

  if (!install) {
    console.log(
      `
To finish upgrading, complete the following steps:

- Install the updated dependencies: pnpm install
- Build the vendored React files: (inside packages/next dir) pnpm ncc-compiled

Or run this command again without the --no-install flag to do both automatically.
    `
    )
  }

  if (errors.length) {
    // eslint-disable-next-line no-undef -- Defined in Node.js
    throw new AggregateError(errors)
  }

  if (createPull) {
    const octokit = new Octokit({ auth: githubToken })
    const prTitle = `Upgrade React from \`${baseSha}-${baseDateString}\` to \`${newSha}-${newDateString}\``

    await execa('git', ['checkout', '-b', branchName])
    // We didn't commit intermediate steps yet so now we need to commit to create a PR.
    if (!commit) {
      commitEverything(prTitle)
    }
    await execa('git', ['push', 'origin', branchName])
    const pullRequest = await octokit.rest.pulls.create({
      owner: repoOwner,
      repo: repoName,
      head: branchName,
      base: 'canary',
      draft: false,
      title: prTitle,
      body: prDescription,
    })
    console.log('Created pull request %s', pullRequest.data.html_url)

    await Promise.all([
      actor
        ? octokit.rest.issues.addAssignees({
            owner: repoOwner,
            repo: repoName,
            issue_number: pullRequest.data.number,
            assignees: [actor],
          })
        : Promise.resolve(),
      octokit.rest.pulls.requestReviewers({
        owner: repoOwner,
        repo: repoName,
        pull_number: pullRequest.data.number,
        reviewers: pullRequestReviewers,
      }),
      octokit.rest.issues.addLabels({
        owner: repoOwner,
        repo: repoName,
        issue_number: pullRequest.data.number,
        labels: pullRequestLabels,
      }),
    ])
  }

  console.log(prDescription)
  console.log(
    `Successfully updated React from \`${baseSha}-${baseDateString}\` to \`${newSha}-${newDateString}\``
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
