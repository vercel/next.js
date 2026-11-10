// @ts-check

// Builds the Markdown changelog for a GitHub release by grouping the commits in
// a release range into sections based on the labels of the pull request each
// commit came from. This replaces the third-party `release` package (and its
// `release.js` hook) with logic we own, so a release always targets the exact
// tag we created rather than the highest-semver tag reachable from HEAD.

// section heading -> the PR label that maps a change into it
const sectionLabelMap = {
  'Core Changes': 'type: next',
  'Documentation Changes': 'documentation',
  'Example Changes': 'examples',
}

const fallbackSection = 'Misc Changes'

const prNumberRegex = /\(#(\d+)\)$/

/**
 * Extract the pull request number from a squash-merge commit title like
 * "Fix something (#1234)".
 */
function getPullRequestNumber(commitTitle) {
  const match = prNumberRegex.exec(commitTitle)
  if (!match) {
    return null
  }
  const number = parseInt(match[1], 10)
  return Number.isNaN(number) ? null : number
}

function getSectionForLabels(labels) {
  // Sections defined first take priority.
  for (const [section, label] of Object.entries(sectionLabelMap)) {
    if (labels.some((prLabel) => prLabel.name === label)) {
      return section
    }
  }
  return null
}

function cleanupPRTitle(title) {
  return title.startsWith('[Docs] ') ? title.replace('[Docs] ', '') : title
}

function isBotLogin(login) {
  return !login || login.includes('[bot]')
}

/**
 * @typedef {Awaited<ReturnType<import('octokit').Octokit['rest']['pulls']['get']>>['data']} GitHubPullRequest
 */

/**
 * Group commits into changelog sections.
 *
 * @param {Array<{ title: string }>} commits Commits in the release range
 *   (release/version-bump commits already removed).
 * @param {(number: number) => Promise<null | GitHubPullRequest>} getPullRequest Resolve a PR
 *   by number (returns `{ title, number, labels: [{ name }], user: { login } }`)
 *   or `null`/an object missing those fields when it can't be resolved.
 */
async function groupCommits(commits, getPullRequest) {
  const sections = Object.keys(sectionLabelMap).reduce((acc, section) => {
    acc[section] = []
    return acc
  }, /** @type {Record<string, Array<{title: string, number?: number}>>} */ ({}))
  sections.__fallback = []

  const authors = new Set()

  for (const commit of commits) {
    const number = getPullRequestNumber(commit.title)
    const pullRequest = number != null ? await getPullRequest(number) : null

    // Fall back to the raw commit when there is no resolvable PR with labels.
    if (!pullRequest || !Array.isArray(pullRequest.labels)) {
      sections.__fallback.push({ title: commit.title })
      continue
    }

    if (pullRequest.user && !isBotLogin(pullRequest.user.login)) {
      authors.add(pullRequest.user.login)
    }

    const section = getSectionForLabels(pullRequest.labels)
    const entry = { title: pullRequest.title, number: pullRequest.number }

    if (section) {
      sections[section].push(entry)
    } else {
      sections.__fallback.push(entry)
    }
  }

  return { sections, authors }
}

function buildCreditsLine(authors) {
  if (authors.size === 0) {
    return ''
  }

  let text = '### Credits \n\nHuge thanks to '

  let index = 1
  authors.forEach((author) => {
    // GitHub links usernames when prefixed with @.
    text += `@${author}`

    const penultimate = index === authors.size - 1
    const notLast = index !== authors.size

    if (penultimate) {
      // Oxford comma when the list is bigger than 2 names.
      if (authors.size > 2) {
        text += ','
      }
      text += ' and '
    } else if (notLast) {
      text += ', '
    }

    index += 1
  })

  text += ' for helping!\n'
  return text
}

/**
 * Render the changelog Markdown from grouped sections.
 */
function buildChangelog(sections, authors) {
  let text = ''

  for (const section in sections) {
    const changes = sections[section]
    if (changes.length === 0) {
      continue
    }

    const title = section === '__fallback' ? fallbackSection : section
    text += `### ${title}\n\n`

    for (const change of changes) {
      const numberText = change.number != null ? `: #${change.number}` : ''
      text += `- ${cleanupPRTitle(change.title)}${numberText}\n`
    }

    text += '\n'
  }

  text += buildCreditsLine(authors)

  return text.trimEnd()
}

/**
 * Generate the release changelog Markdown for a set of commits.
 *
 * @param {object} options
 * @param {Array<{ title: string }>} options.commits
 * @param {(number: number) => Promise<any | null>} options.getPullRequest
 */
async function generateChangelog({ commits, getPullRequest }) {
  const { sections, authors } = await groupCommits(commits, getPullRequest)
  return buildChangelog(sections, authors)
}

module.exports = {
  generateChangelog,
  getPullRequestNumber,
}
