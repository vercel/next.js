import glob from 'glob'
import fs from 'fs'
import path from 'path'
import { getChangelogSection } from './utils'

interface Changelog {
  version: string
  section: string
}

function getPackageChangelogs(): Record<string, Changelog> {
  const packageDirs = glob.sync('packages/*')
  const sections: Record<string, Changelog> = {}

  for (const dir of packageDirs) {
    const packageJsonPath = path.join(dir, 'package.json')
    const changelogPath = path.join(dir, 'CHANGELOG.md')

    if (!fs.existsSync(packageJsonPath) || !fs.existsSync(changelogPath)) {
      continue
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    const packageName = packageJson.name
    const version = packageJson.version

    if (!packageName) {
      throw new Error(`No package name found for ${dir}.`)
    }
    if (!version) {
      throw new Error(`No version found for ${packageName}.`)
    }

    const content = fs.readFileSync(changelogPath, 'utf8')
    const section = getChangelogSection(content, version)

    if (section) {
      sections[packageName] = { version, section }
    }
  }

  return sections
}

function getCredits(): string[] {
  const credits: Record<string, ''> = require(
    path.join(process.cwd(), '.changeset/credits.json')
  )
  return Object.keys(credits)
}

/**
 * @example
 * ```markdown
 * ## `next@15.4.0`
 *
 * ### Minor Changes
 *
 * - ... #12345
 *
 * ### Patch Changes
 *
 * - ... #12345
 *
 * ## `create-next-app@15.0.0`
 *
 * ### Minor Changes
 *
 * - ... #12345
 *
 * ## Credits
 *
 * Huge thanks to ... for helping!
 * ```
 */
function writeReleaseNote(changelogs: Record<string, Changelog>): string {
  let releaseNote = ''

  for (const [packageName, { version, section }] of Object.entries(
    changelogs
  )) {
    releaseNote += `## \`${packageName}@${version}\`\n\n${section}\n\n`
  }

  const credits = getCredits()
  const thanksTo = `Huge thanks to ${credits.join(', ')} for helping!`
  releaseNote += `## Credits\n\n${thanksTo}`

  return releaseNote
}

export default async function publishReleaseNote() {
  const changelogs = getPackageChangelogs()
  const releaseNote = writeReleaseNote(changelogs)
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

publishReleaseNote()
