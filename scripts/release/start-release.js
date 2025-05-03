// @ts-check
const { exec } = require('./utils')

async function main() {
  const githubToken = process.env.RELEASE_BOT_GITHUB_TOKEN
  if (!githubToken) {
    console.log('Missing RELEASE_BOT_GITHUB_TOKEN')
    return
  }

  await exec('pnpm changeset version')

  const isNewRelease = process.env.__NEW_RELEASE === 'true'
  const isLegacyRelease = !isNewRelease
  // Dry run the new process w/o triggering the legacy process.
  // During the legacy process, run the new process as a dry run.
  const isDryRun =
    process.env.__NEW_RELEASE_DRY_RUN === 'true' || isLegacyRelease
  if (isDryRun) {
    // Create a .diff output and revert the `changeset version` result.
    await exec('git diff > .changeset/canary.diff')
    await exec('git add .changeset/canary.diff')
    await exec('git checkout -- .')

    // In legacy process, Lerna will push including the change.
    if (isLegacyRelease) {
      return
    }
  }

  await exec(
    `git remote set-url origin https://vercel-release-bot:${githubToken}@github.com/vercel/next.js.git`
  )
  await exec(`git config user.name "vercel-release-bot"`)
  await exec(`git config user.email "infra+release@vercel.com"`)

  const commitMessage = isDryRun
    ? `Version Package (dry)\n[skip ci]`
    : `Version Package`

  await exec('git add .')
  await exec(`git commit -m "${commitMessage}"`)
  // Bypass pre-push hook.
  await exec('git push --no-verify')
}

// TODO: Uncomment when replacing legacy release.
// main()
module.exports = main
