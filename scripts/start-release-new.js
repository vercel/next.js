// @ts-check
const fs = require('fs/promises')
const path = require('path')
const execa = require('execa')

async function runChangesetVersion(tag) {
  const isCanary = tag === 'canary'

  const configPath = path.join(process.cwd(), '.changeset/config.json')
  const config = require(configPath)
  const originalChangelog = config.changelog
  if (isCanary) {
    // Set `changelog: false` to avoid adding CHANGELOG.md for canary.
    config.changelog = false
    await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  }

  await execa('pnpm changeset version', {
    stdio: 'inherit',
    shell: true,
  })

  if (isCanary) {
    config.changelog = originalChangelog
    await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  }
}

export async function startReleaseNew() {
  const githubToken = process.env.RELEASE_BOT_GITHUB_TOKEN
  if (!githubToken) {
    console.log('Missing RELEASE_BOT_GITHUB_TOKEN')
    return
  }

  const tag = process.env.RELEASE_TAG
  if (!tag) {
    console.log('Missing RELEASE_TAG')
    return
  }

  await runChangesetVersion(tag)

  // Dry run the new process w/o triggering the legacy process.
  const isNewReleaseDryRun = process.env.__NEW_RELEASE_DRY_RUN === 'true'
  // During the legacy process, run the new process as a dry run.
  const isDryRun = isNewReleaseDryRun || process.env.__NEW_RELEASE !== 'true'
  if (isDryRun) {
    // Create a .diff output and revert the `changeset version` result.
    await execa('git diff > .changeset/canary.diff', {
      stdio: 'inherit',
      shell: true,
    })
    await execa('git add .changeset/canary.diff', {
      stdio: 'inherit',
      shell: true,
    })
    await execa('git checkout -- .', {
      stdio: 'inherit',
      shell: true,
    })

    // In legacy process, Lerna will push including the change.
    if (!isNewReleaseDryRun) {
      return
    }
  }

  await execa(
    `git remote set-url origin https://vercel-release-bot:${githubToken}@github.com/vercel/next.js.git`,
    { stdio: 'inherit', shell: true }
  )
  await execa(`git config user.name "vercel-release-bot"`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git config user.email "infra+release@vercel.com"`, {
    stdio: 'inherit',
    shell: true,
  })

  const { version } = require(require.resolve('next/package.json'))
  const commitMessage = isNewReleaseDryRun
    ? `v${version} (dry) [skip ci]`
    : `v${version}`

  await execa('git add .', {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git commit -m "${commitMessage}"`, {
    stdio: 'inherit',
    shell: true,
  })
  // Bypass pre-push hook.
  await execa('git push --no-verify', {
    stdio: 'inherit',
    shell: true,
  })
}

// TODO: Uncomment when replacing legacy release.
// release()
