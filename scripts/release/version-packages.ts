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

    // Create empty changeset for `next` to bump canary version even if
    // there was no changeset.
    const res = await execa('pnpm', ['changeset', 'version'])
    if (res.stderr.includes('No unreleased changesets found, exiting.')) {
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
