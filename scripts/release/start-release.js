// @ts-check
const fs = require('fs/promises')
const path = require('path')
const execa = require('execa')

function exec(command) {
  return execa(command, {
    stdio: 'inherit',
    shell: true,
  })
}

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

  await exec('pnpm changeset version')

  if (isCanary) {
    config.changelog = originalChangelog
    await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  }
}

async function main() {
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
    await exec('git diff > .changeset/canary.diff')
    await exec('git add .changeset/canary.diff')
    await exec('git checkout -- .')

    // In legacy process, Lerna will push including the change.
    if (!isNewReleaseDryRun) {
      return
    }
  }

  await exec(
    `git remote set-url origin https://vercel-release-bot:${githubToken}@github.com/vercel/next.js.git`
  )
  await exec(`git config user.name "vercel-release-bot"`)
  await exec(`git config user.email "infra+release@vercel.com"`)

  const { version } = require(require.resolve('next/package.json'))
  const commitMessage = isNewReleaseDryRun
    ? `v${version} (dry) [skip ci]`
    : `v${version}`

  await exec('git add .')
  await exec(`git commit -m "${commitMessage}"`)
  // Bypass pre-push hook.
  await exec('git push --no-verify')
}

// TODO: Uncomment when replacing legacy release.
// main()
module.exports = main
