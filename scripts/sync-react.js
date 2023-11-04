// @ts-check

const path = require('path')
const fsp = require('fs/promises')
const execa = require('execa')

/** @type {any} */
const fetch = require('node-fetch')

// Use this script to update Next's vendored copy of React and related packages:
//
// Basic usage (defaults to most recent React canary version):
//   pnpm run sync-react
//
// Update package.json but skip installing the dependencies automatically:
//   pnpm run sync-react --no-install

async function sync(channel = 'next') {
  const noInstall = readBoolArg(process.argv, 'no-install')
  const useExperimental = channel === 'experimental'
  let newVersionStr = readStringArg(process.argv, 'version')
  if (newVersionStr === null) {
    const { stdout, stderr } = await execa(
      'npm',
      [
        'view',
        useExperimental ? 'react@experimental' : 'react@next',
        'version',
      ],
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

  const newVersionInfo = extractInfoFromReactCanaryVersion(newVersionStr)
  if (!newVersionInfo) {
    throw new Error(
      `New react version does not match expected format: ${newVersionStr}

Choose a React canary version from npm: https://www.npmjs.com/package/react?activeTab=versions

Or, run this command with no arguments to use the most recently published version.
`
    )
  }

  const cwd = process.cwd()
  const pkgJson = JSON.parse(
    await fsp.readFile(path.join(cwd, 'package.json'), 'utf-8')
  )
  const devDependencies = pkgJson.devDependencies
  const baseVersionStr = devDependencies[
    useExperimental ? 'react-experimental-builtin' : 'react-builtin'
  ].replace(/^npm:react@/, '')

  const baseVersionInfo = extractInfoFromReactCanaryVersion(baseVersionStr)
  if (!baseVersionInfo) {
    throw new Error(
      'Base react version does not match expected format: ' + baseVersionStr
    )
  }

  const {
    sha: newSha,
    releaseLabel: newReleaseLabel,
    dateString: newDateString,
  } = newVersionInfo
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
        `${newReleaseLabel}-${newSha}-${newDateString}`
      )
    }
  }
  await fsp.writeFile(
    path.join(cwd, 'package.json'),
    JSON.stringify(pkgJson, null, 2)
  )
  console.log('Successfully updated React dependencies in package.json.\n')

  // Install the updated dependencies and build the vendored React files.
  if (noInstall) {
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
    const nccSubprocess = execa('pnpm', ['taskr', 'copy_vendor_react'], {
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

  console.log(`Successfully updated React from ${baseSha} to ${newSha}.\n`)

  // Fetch the changelog from GitHub and print it to the console.
  try {
    const changelog = await getChangelogFromGitHub(baseSha, newSha)
    if (changelog === null) {
      console.log(
        `GitHub reported no changes between ${baseSha} and ${newSha}.`
      )
    } else {
      console.log(`### React upstream changes\n\n${changelog}\n\n`)
    }
  } catch (error) {
    console.error(error)
    console.log(
      '\nFailed to fetch changelog from GitHub. Changes were applied, anyway.\n'
    )
  }

  if (noInstall) {
    console.log(
      `
To finish upgrading, complete the following steps:

- Install the updated dependencies: pnpm install
- Build the vendored React files: (inside packages/next dir) pnpm taskr ncc

Or run this command again without the --no-install flag to do both automatically.
    `
    )
  }
}

function readBoolArg(argv, argName) {
  return argv.indexOf('--' + argName) !== -1
}

function readStringArg(argv, argName) {
  const argIndex = argv.indexOf('--' + argName)
  return argIndex === -1 ? null : argv[argIndex + 1]
}

function extractInfoFromReactCanaryVersion(reactCanaryVersion) {
  const match = reactCanaryVersion.match(
    /(?<semverVersion>.*)-(?<releaseLabel>.*)-(?<sha>.*)-(?<dateString>.*)$/
  )
  return match ? match.groups : null
}

async function getChangelogFromGitHub(baseSha, newSha) {
  const pageSize = 50
  let changelog = []
  for (let currentPage = 0; ; currentPage++) {
    const response = await fetch(
      `https://api.github.com/repos/facebook/react/compare/${baseSha}...${newSha}?per_page=${pageSize}&page=${currentPage}`
    )
    if (!response.ok) {
      throw new Error('Failed to fetch commit log from GitHub.')
    }
    const data = await response.json()

    const { commits } = data
    for (const { commit, sha } of commits) {
      const title = commit.message.split('\n')[0] || ''
      // The "title" looks like "[Fiber][Float] preinitialized stylesheets should support integrity option (#26881)"
      const match = /\(#([0-9]+)\)$/.exec(title)
      const prNum = match ? match[1] : ''
      if (prNum) {
        changelog.push(`- https://github.com/facebook/react/pull/${prNum}`)
      } else {
        changelog.push(
          `-  ${sha.slice(0, 9)} ${commit.message.split('\n')[0]} (${
            commit.author.name
          })`
        )
      }
    }

    if (commits.length !== pageSize) {
      // If the number of commits is less than the page size, we've reached
      // the end. Otherwise we'll keep fetching until we run out.
      break
    }
  }

  changelog.reverse()

  return changelog.length > 0 ? changelog.join('\n') : null
}

sync('canary')
  .then(() => sync('experimental'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
