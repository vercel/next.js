import { getCredits, getPackageChangelogs } from './utils'
import { writeReleaseNote } from './utils/write-release-note'

export default async function publishReleaseNote() {
  const changelogs = getPackageChangelogs()
  const credits = getCredits(process.cwd())
  const releaseNote = writeReleaseNote(changelogs, credits)
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
          draft: !isCanary,
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
  }
}

if (!process.env.NEXT_TEST_MODE) {
  publishReleaseNote()
}
