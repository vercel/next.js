import execa from 'execa'
import { existsSync } from 'fs'
import { writeFile, readFile, unlink } from 'fs/promises'
import { join } from 'path'

// NOTE: This type may change over time.
type ChangesetStatusJson = {
  changesets: {
    releases: {
      name: string
      type: string
      summary: string
      id: string
    }[]
  }[]
  releases: {
    name: string
    type: string
    oldVersion: string
    changesets: string[]
    newVersion: string
  }[]
}

async function versionPackages() {
  const preConfigPath = join(process.cwd(), '.changeset', 'pre.json')

  // Exit previous pre mode to prepare for the next release.
  if (existsSync(preConfigPath)) {
    if (require(preConfigPath).mode !== 'exit') {
      // Since current repository is in pre mode, need
      // to exit before versioning the packages.
      await execa('pnpm', ['changeset', 'pre', 'exit'], {
        stdio: 'inherit',
      })
    }
  }

  // For prereleases, we need to set the "mode" on `pre.json`, which
  // can be done by running `changeset pre enter <mode>`.
  const releaseType = process.env.RELEASE_TYPE
  switch (releaseType) {
    case 'canary': {
      // Enter pre mode as "canary" tag.
      await execa('pnpm', ['changeset', 'pre', 'enter', 'canary'], {
        stdio: 'inherit',
      })

      console.log(
        '▲   Preparing to bump the canary version, checking if there are any changesets.'
      )

      // Create an empty changeset for `next` to bump the canary version
      // even if there are no changesets for `next`.
      await execa('pnpm', [
        'changeset',
        'status',
        '--output',
        './changeset-status.json',
      ])

      let hasNextChangeset = false
      if (existsSync('./changeset-status.json')) {
        const changesetStatus: ChangesetStatusJson = JSON.parse(
          await readFile('./changeset-status.json', 'utf8')
        )

        console.log('▲   Changeset Status:')
        console.log(changesetStatus)

        hasNextChangeset =
          changesetStatus.releases.find(
            (release) => release.name === 'next'
          ) !== undefined

        await unlink('./changeset-status.json')
      }

      if (!hasNextChangeset) {
        console.log(
          '▲   No changesets found for `next`, creating an empty changeset.'
        )
        // TODO: Since this is temporary until we hard-require a changeset, we will
        // need to remove this in the future to prevent publishing empty releases.
        await writeFile(
          join(process.cwd(), '.changeset', `next-canary-${Date.now()}.md`),
          `---\n'next': patch\n---`
        )
      }
      break
    }
    case 'release-candidate': {
      // Enter pre mode as "rc" tag.
      await execa('pnpm', ['changeset', 'pre', 'enter', 'rc'], {
        stdio: 'inherit',
      })
      break
    }
    case 'beta': {
      // Enter pre mode as "beta" tag.
      await execa('pnpm', ['changeset', 'pre', 'enter', 'beta'], {
        stdio: 'inherit',
      })
      break
    }
    case 'stable': {
      // No additional steps needed for 'stable' releases since we've already
      // exited any pre-release mode. Only need to run `changeset version` after.
      break
    }
    default: {
      throw new Error(`Invalid release type: ${releaseType}`)
    }
  }

  await execa('pnpm', ['changeset', 'version'], {
    stdio: 'inherit',
  })
  // TODO: Update the pnpm-lock.yaml since the packages' depend on
  // each other. Remove this once they use `workspace:` protocol.
  await execa('pnpm', ['install', '--no-frozen-lockfile'], {
    stdio: 'inherit',
  })
}

versionPackages()
