import { exec } from './utils'

export default async function startRelease() {
  const githubToken = process.env.RELEASE_BOT_GITHUB_TOKEN
  if (!githubToken) {
    throw new Error('Missing RELEASE_BOT_GITHUB_TOKEN')
  }
  const releaseType = process.env.RELEASE_TYPE
  if (!releaseType) {
    throw new Error('Missing RELEASE_TYPE')
  }

  const isCanary = releaseType === 'canary'
  if (isCanary) {
    await exec('pnpm changeset version')
  } else {
    if (releaseType === 'release-candidate') {
      await exec('pnpm changeset pre exit')
      // TODO: This might not reset version to rc.0
      await exec('pnpm changeset pre enter rc')
    }
    if (releaseType === 'stable') {
      await exec('pnpm changeset pre exit')
    }

    await exec('pnpm changeset version')
    // Set back the prerelease mode to canary.
    await exec('pnpm changeset pre exit')
    await exec('pnpm changeset pre enter canary')
  }

  const isDryRun = process.env.__NEW_RELEASE_DRY_RUN === 'true'
  const isNewRelease = process.env.__NEW_RELEASE === 'true' || isDryRun
  const isLegacyRelease = !isNewRelease
  if (isLegacyRelease) {
    // Create a .diff output and revert the `changeset version` result.
    await exec('git diff > .changeset/dry-run-version.diff')
    await exec('git add .changeset/dry-run-version.diff')
    await exec('git checkout -- .')

    // In legacy process, Lerna will push including the change.
    return
  }

  await exec(
    `git remote set-url origin https://vercel-release-bot:${githubToken}@github.com/vercel/next.js.git`
  )
  await exec(`git config user.name "vercel-release-bot"`)
  await exec(`git config user.email "infra+release@vercel.com"`)

  const { version } = require('next/package.json')
  const commitMessage = isDryRun ? `v${version} (new dry)` : `v${version} (new)`

  await exec('git add .')
  await exec(`git commit --message "${commitMessage}"`)

  if (isCanary) {
    // Bypass pre-push hook and push to the canary branch.
    await exec('git push --no-verify')
  } else {
    const branchName = `release/v${version}-${releaseType}`
    try {
      await exec(`git checkout --branch ${branchName}`)
      await exec(`git push origin ${branchName}`)

      const res = await fetch(
        'https://api.github.com/repos/vercel/next.js/pulls',
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            Authorization: `Bearer ${githubToken}`,
          },
          // https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#create-a-pull-request--parameters
          body: JSON.stringify({
            title: commitMessage,
            body: '',
            head: branchName,
            base: 'canary',
            draft: false,
            maintainer_can_modify: true,
          }),
        }
      )
      if (!res.ok) {
        throw new Error(
          `Failed to create a pull request. Received status: ${res.status} ${res.statusText}`
        )
      }
      const data = await res.json()
      if (data.url) {
        // TODO: Slack
        console.log(`Pull request created: ${data.url}`)
      } else {
        throw new Error(
          `Failed to create a pull request. Received: ${JSON.stringify(data, null, 2)}`
        )
      }
    } catch (error) {
      // TODO: Slack
      console.error(error)
    }
  }
}

startRelease()
