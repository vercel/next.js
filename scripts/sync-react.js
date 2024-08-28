// @ts-check

const path = require('path')
const fsp = require('fs/promises')
const process = require('process')
const execa = require('execa')
const yargs = require('yargs')

/** @type {any} */
const fetch = require('node-fetch')

const filesReferencingReactPeerDependencyVersion = [
  'run-tests.js',
  'packages/create-next-app/templates/index.ts',
  'test/lib/next-modes/base.ts',
]
const appManifestsInstallingNextjsPeerDependencies = [
  'examples/reproduction-template/package.json',
  'test/.stats-app/package.json',
  // TODO: These should use the usual test helpers that automatically install the right React version
  'test/e2e/next-test/first-time-setup-js/package.json',
  'test/e2e/next-test/first-time-setup-ts/package.json',
]

// Use this script to update Next's vendored copy of React and related packages:
//
// Basic usage (defaults to most recent React canary version):
//   pnpm run sync-react
//
// Update package.json but skip installing the dependencies automatically:
//   pnpm run sync-react --no-install

async function sync({
  channel,
  newVersionStr,
  newSha,
  newDateString,
  noInstall,
}) {
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

  const baseVersionInfo = extractInfoFromReactVersion(baseVersionStr)
  if (!baseVersionInfo) {
    throw new Error(
      'Base react version does not match expected format: ' + baseVersionStr
    )
  }

  const {
    sha: baseSha,
    releaseLabel: baseReleaseLabel,
    dateString: baseDateString,
  } = baseVersionInfo

  console.log(`Updating "react@${channel}" to ${newSha}...\n`)
  if (newSha === baseSha) {
    console.log('Already up to date.')
    return
  }

  for (const [dep, version] of Object.entries(devDependencies)) {
    if (version.endsWith(`${baseReleaseLabel}-${baseSha}-${baseDateString}`)) {
      devDependencies[dep] = version.replace(
        `${baseReleaseLabel}-${baseSha}-${baseDateString}`,
        `${channel}-${newSha}-${newDateString}`
      )
    }
  }
  for (const [dep, version] of Object.entries(pnpmOverrides)) {
    if (version.endsWith(`${baseReleaseLabel}-${baseSha}-${baseDateString}`)) {
      pnpmOverrides[dep] = version.replace(
        `${baseReleaseLabel}-${baseSha}-${baseDateString}`,
        `${channel}-${newSha}-${newDateString}`
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
    .options('install', { default: true, type: 'boolean' })
    .options('version', { default: null, type: 'string' }).argv
  const { install, version } = argv

  let newVersionStr = version
  if (newVersionStr === null) {
    const { stdout, stderr } = await execa(
      'npm',
      ['view', 'react@canary', 'version'],
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
  const rootManifest = JSON.parse(
    await fsp.readFile(path.join(cwd, 'package.json'), 'utf-8')
  )
  const baseVersionStr = rootManifest.devDependencies['react-builtin'].replace(
    /^npm:react@/,
    ''
  )

  await sync({
    newDateString,
    newSha,
    newVersionStr,
    noInstall: !install,
    channel: 'experimental',
  })
  await sync({
    newDateString,
    newSha,
    newVersionStr,
    noInstall: !install,
    channel: 'rc',
  })

  const baseVersionInfo = extractInfoFromReactVersion(baseVersionStr)
  if (!baseVersionInfo) {
    throw new Error(
      'Base react version does not match expected format: ' + baseVersionStr
    )
  }

  const { sha: baseSha, dateString: baseDateString } = baseVersionInfo
  for (const fileName of filesReferencingReactPeerDependencyVersion) {
    const filePath = path.join(cwd, fileName)
    const previousSource = await fsp.readFile(filePath, 'utf-8')
    const updatedSource = previousSource.replace(
      `const nextjsReactPeerVersion = "${baseVersionStr}";`,
      `const nextjsReactPeerVersion = "${newVersionStr}";`
    )
    if (updatedSource === previousSource) {
      errors.push(
        new Error(
          `${fileName}: Failed to update ${baseVersionStr} to ${newVersionStr}. Is this file still referencing the React peer dependency version?`
        )
      )
    } else {
      await fsp.writeFile(filePath, updatedSource)
    }
  }

  const nextjsPackageJsonPath = path.join(
    process.cwd(),
    'packages',
    'next',
    'package.json'
  )
  const nextjsPackageJson = JSON.parse(
    await fsp.readFile(nextjsPackageJsonPath, 'utf-8')
  )
  nextjsPackageJson.peerDependencies.react = `${newVersionStr}`
  nextjsPackageJson.peerDependencies['react-dom'] = `${newVersionStr}`
  await fsp.writeFile(
    nextjsPackageJsonPath,
    JSON.stringify(nextjsPackageJson, null, 2) +
      // Prettier would add a newline anyway so do it manually to skip the additional `pnpm prettier-write`
      '\n'
  )

  for (const fileName of appManifestsInstallingNextjsPeerDependencies) {
    const packageJsonPath = path.join(cwd, fileName)
    const packageJson = await fsp.readFile(packageJsonPath, 'utf-8')
    const manifest = JSON.parse(packageJson)
    manifest.dependencies['react'] = newVersionStr
    manifest.dependencies['react-dom'] = newVersionStr
    await fsp.writeFile(
      packageJsonPath,
      JSON.stringify(manifest, null, 2) +
        // Prettier would add a newline anyway so do it manually to skip the additional `pnpm prettier-write`
        '\n'
    )
  }

  // Install the updated dependencies and build the vendored React files.
  if (!install) {
    console.log('Skipping install step because --no-install flag was passed.\n')
  } else {
    console.log('Installing dependencies...\n')

    const installSubprocess = execa('pnpm', ['install'])
    if (installSubprocess.stdout) {
      installSubprocess.stdout.pipe(process.stdout)
    }
    try {
      await installSubprocess
    } catch (error) {
      console.error(error)
      throw new Error('Failed to install updated dependencies.')
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

    // Print extra newline after ncc output
    console.log()
  }

  console.log(
    `**breaking change for canary users: Bumps peer dependency of React from \`${baseVersionStr}\` to \`${newVersionStr}\`**`
  )

  // Fetch the changelog from GitHub and print it to the console.
  console.log(
    `[diff facebook/react@${baseSha}...${newSha}](https://github.com/facebook/react/compare/${baseSha}...${newSha})`
  )
  try {
    const changelog = await getChangelogFromGitHub(baseSha, newSha)
    if (changelog === null) {
      console.log(
        `GitHub reported no changes between ${baseSha} and ${newSha}.`
      )
    } else {
      console.log(
        `<details>\n<summary>React upstream changes</summary>\n\n${changelog}\n\n</details>`
      )
    }
  } catch (error) {
    console.error(error)
    console.log(
      '\nFailed to fetch changelog from GitHub. Changes were applied, anyway.\n'
    )
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

  await fsp.writeFile(path.join(cwd, '.github/.react-version'), newVersionStr)

  if (errors.length) {
    // eslint-disable-next-line no-undef -- Defined in Node.js
    throw new AggregateError(errors)
  }

  console.log(
    `Successfully updated React from \`${baseSha}-${baseDateString}\` to \`${newSha}-${newDateString}\``
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
