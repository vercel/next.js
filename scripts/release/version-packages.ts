import execa from 'execa'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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

  const releaseType = process.env.RELEASE_TYPE

  if (releaseType === 'canary') {
    // Enter pre mode as "canary" tag.
    await execa('pnpm', ['changeset', 'pre', 'enter', 'canary'], {
      stdio: 'inherit',
    })

    console.log(
      '▲   Preparing to bump the canary version, checking if there are any changesets.'
    )
    // Create an empty changeset for `next` to bump the canary version
    // even if there are no changesets for `next`.
    const res = await execa('pnpm', ['changeset', 'status'], {
      // If there are no changesets, this will error. Set reject: false
      // to avoid trycatch and handle the rest based on the stdout.
      reject: false,
    })

    console.log('▲   Changeset Status:')
    console.log({ ...res })

    if (!res.stdout.includes('- next')) {
      console.log(
        '▲   No changesets found for `next`, creating an empty changeset.'
      )
      await writeFile(
        join(process.cwd(), '.changeset', `next-canary-${Date.now()}.md`),
        `---\n'next': patch\n---`
      )
    }
  }

  await execa('pnpm', ['changeset', 'version'], {
    stdio: 'inherit',
  })
  await execa('pnpm', ['install', '--no-frozen-lockfile'], {
    stdio: 'inherit',
  })
}

versionPackages()
