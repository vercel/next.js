import type { ChangelogFunctions } from '@changesets/types'

import { writeFile } from 'node:fs/promises'
import { getInfo, getInfoFromPullRequest } from '@changesets/get-github-info'
import { getPrNumbersFromEndOfSummary } from './get-pr-numbers-from-end-of-summary'

// Note: This script runs during `changeset version` in CI.
if (!process.env.GITHUB_TOKEN) {
  throw new Error(
    'Please create a GitHub personal access token at https://github.com/settings/tokens/new with `read:user` and `repo:status` permissions and add it as the GITHUB_TOKEN environment variable.'
  )
}

async function addCredits(user: string) {
  const credits = require('../github/credits.json')
  // Set on Object.keys to reduce duplicates earlier.
  credits[user] = ''
  await writeFile('./credits.json', JSON.stringify(credits, null, 2))
}

const defaultChangelogFunctions: ChangelogFunctions = {
  async getReleaseLine(changeset) {
    if (!changeset.commit) {
      throw new Error(
        `Failed to get the required commit from the changeset: ${changeset}.`
      )
    }

    const { user, pull } = await getInfo({
      repo: 'vercel/next.js',
      commit: changeset.commit,
    })

    if (!user) {
      throw new Error(
        `Failed to get the required username from the changeset commit: ${changeset.commit}.`
      )
    }
    if (!pull) {
      throw new Error(
        `Failed to get the required PR number from the changeset commit: ${changeset.commit}.`
      )
    }

    // If the summary ends with #<number>, assume this
    // changeset explicitly specified the PR number(s)
    // following the custom convension.
    // Example: ... #123 or ... #123, #456
    const pullNumbers = getPrNumbersFromEndOfSummary(changeset.summary)
    if (pullNumbers) {
      await Promise.all(
        pullNumbers.map(async (pullNumber) => {
          try {
            const { links } = await getInfoFromPullRequest({
              pull: parseInt(pullNumber, 10),
              repo: 'vercel/next.js',
            })
            if (links.user) {
              await addCredits(links.user)
            }
          } catch (cause) {
            throw new Error(
              `Failed to get the required info for PR #${pullNumber}`,
              { cause }
            )
          }
        })
      )

      return `- ${changeset.summary}`
    }

    await addCredits(user)
    return `- ${changeset.summary} #${pull}`
  },
  // Do not include dependency updates.
  async getDependencyReleaseLine() {
    return ''
  },
}

export default defaultChangelogFunctions
