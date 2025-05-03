// @ts-check
const { exec } = require('./utils')

async function main() {
  const githubToken = process.env.RELEASE_BOT_GITHUB_TOKEN
  if (!githubToken) {
    console.log('Missing RELEASE_BOT_GITHUB_TOKEN')
    return
  }

  await exec('pnpm changeset version')

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
