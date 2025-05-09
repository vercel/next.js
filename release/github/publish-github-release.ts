import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createReleaseNote } from './create-release-note'
import { checkIsNewRelease } from '../utils'
import { getPackageChangelogInfo } from './get-package-changelog-info'
import { getCredits } from './get-credits'

async function publishGitHubRelease() {
  const { isDryRun } = checkIsNewRelease()
  const changelogs = getPackageChangelogInfo()
  const credits = await getCredits()
  const releaseNote = createReleaseNote(changelogs, credits)
  const nextjsVersion = changelogs['next'].version
  const isCanary = nextjsVersion.includes('canary')
  try {
    // https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#create-a-release
    const res = await fetch(
      `https://api.github.com/repos/vercel/next.js/releases`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.RELEASE_BOT_GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          tag_name: `v${nextjsVersion}`,
          name: `v${nextjsVersion}`,
          body: releaseNote,
          prerelease: isCanary,
          draft: isDryRun || !isCanary,
        }),
      }
    )
    const release = await res.json()
    console.log(
      `The release note for v${nextjsVersion} created${
        release.draft ? ' as draft' : ''
      } successfully at ${release.url}.`
    )
    if (!isCanary) {
      // TODO: Notify via Slack.
      console.log('Confirm and un-draft the release note.')
    }
  } catch (error) {
    // TODO: Notify via Slack.
    console.error(error)
  } finally {
    // Reset the credits file.
    await writeFile(
      join(process.cwd(), '.changeset/utils/credits.json'),
      JSON.stringify({})
    )
  }
}

publishGitHubRelease()
