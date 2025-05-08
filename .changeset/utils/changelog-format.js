// @ts-check
const { ChangelogFunctions } = require('@changesets/types')
const { writeFile } = require('fs/promises')
const { resolve } = require('path')
const {
  getInfo,
  getInfoFromPullRequest,
} = require('@changesets/get-github-info')
const {
  getPrNumbersFromEndOfSummary,
} = require('./get-pr-numbers-from-end-of-summary')

// Note: This script runs during `changeset version` in CI.
if (!process.env.GITHUB_TOKEN) {
  throw new Error(
    'Please create a GitHub personal access token at https://github.com/settings/tokens/new with `read:user` and `repo:status` permissions and add it as the GITHUB_TOKEN environment variable.'
  )
}

async function addCredits(user) {
  if (!user) {
    return
  }

  const credits = require('./credits.json')
  // Set on Object.keys to reduce duplicates earlier.
  credits[user] = ''
  await writeFile('./credits.json', JSON.stringify(credits, null, 2))
}

/** @type {ChangelogFunctions} */
const defaultChangelogFunctions = {
  async getReleaseLine(changeset) {
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
              pull: pullNumber,
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
  async getDependencyReleaseLine() {},
}

module.exports = defaultChangelogFunctions
