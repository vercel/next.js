// @ts-check
import fetch from 'node-fetch'

// Helper function to create a fresh copy of the categories structure
function createCategoriesStructure() {
  const RELEASE_CATEGORIES = {
    '### Core Changes': [],
    '### Minor Changes': [],
    '### Documentation Changes': [],
    '### Example Changes': [],
    '### Misc Changes': [],
    '### Patches': [],
    '### Credits': [],
  }
  return RELEASE_CATEGORIES
}

async function main() {
  // Check if we have command line arguments for version comparison
  const args = process.argv.slice(2)

  if (args.length === 2) {
    // Mode 1: Compare between two versions/commits
    const [fromVersion, toVersion] = args
    return await generateLogBetweenVersions(fromVersion, toVersion)
  } else if (args.length === 0) {
    // Mode 2: Original behavior - generate logs for latest canary releases
    return await generateLatestCanaryLogs()
  } else {
    console.error(
      'Usage: node generate-release-log.mjs [fromVersion toVersion]'
    )
    console.error(
      '  With no arguments: generates logs for latest canary releases'
    )
    console.error(
      '  With two arguments: generates logs between two versions/commits'
    )
    process.exit(1)
  }
}

async function generateLogBetweenVersions(fromVersion, toVersion) {
  console.log(`Fetching commits between ${fromVersion} and ${toVersion}...`)

  try {
    // Use GitHub API to compare commits between two references
    const response = await fetch(
      `https://api.github.com/repos/vercel/next.js/compare/${fromVersion}...${toVersion}`
    )

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      )
    }

    const compareData = await response.json()
    const commits = compareData.commits || []

    console.log(
      `Found ${commits.length} commits between ${fromVersion} and ${toVersion}`
    )

    // Filter out version bump commits and other non-meaningful commits
    const filteredCommits = commits.filter((commit) => {
      const message = commit.commit.message.split('\n')[0]
      const author = commit.author?.login || commit.commit.author.name

      // Skip version bump commits (usually just version number changes)
      if (message.match(/^v\d+\.\d+\.\d+(-\w+\.\d+)?$/)) {
        console.log(`Skipping version bump commit: ${message}`)
        return false
      }

      // Skip automated release commits
      if (author === 'vercel-release-bot' && message.match(/^v\d+\.\d+\.\d+/)) {
        console.log(`Skipping automated release commit: ${message}`)
        return false
      }

      return true
    })

    console.log(`After filtering: ${filteredCommits.length} commits to include`)

    // Categorize commits based on their commit messages
    const categorizedCommits = categorizeCommits(filteredCommits)

    // Generate formatted output
    const content = formatCommitLog(categorizedCommits, fromVersion, toVersion)

    return {
      fromVersion,
      toVersion,
      commitCount: filteredCommits.length,
      content,
    }
  } catch (error) {
    console.error('Error fetching commits:', error.message)
    process.exit(1)
  }
}

async function generateLatestCanaryLogs() {
  const releasesArray = await fetch(
    'https://api.github.com/repos/vercel/next.js/releases?per_page=100'
  ).then((r) => r.json())

  const allReleases = releasesArray
    .map(({ id, tag_name, created_at, body }) => ({
      id,
      tag_name,
      created_at,
      body: body
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((e) => e.trim()),
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  // targetVersion format is `13.4.15-`, generating changes for all 13.4.15-* canary releases
  const targetVersion = /v(.*?-)/
    .exec(allReleases.filter((e) => /v.*?-/.exec(e.tag_name)).pop().tag_name)
    .pop()

  const releases = allReleases.filter((v) => v.tag_name.includes(targetVersion))

  const lineItems = createCategoriesStructure()

  Object.keys(lineItems).forEach((header) => {
    releases.forEach((release) => {
      const headerIndex = release.body.indexOf(header)

      if (!~headerIndex) return

      let headerLastIndex = release.body
        .slice(headerIndex + 1)
        .findIndex((v) => v.startsWith('###'))

      if (~headerLastIndex) {
        headerLastIndex = headerLastIndex + headerIndex
      } else {
        headerLastIndex = release.body.length - 1
      }

      if (header === '### Credits') {
        release.body.slice(headerIndex, headerLastIndex + 1).forEach((e) => {
          const re = /@[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}/gi
          let m

          do {
            m = re.exec(e)

            if (m) {
              lineItems[header].push(m.pop())
            }
          } while (m)
        })
      } else {
        release.body.slice(headerIndex, headerLastIndex + 1).forEach((e) => {
          if (!e.startsWith('-')) {
            return
          }
          lineItems[header].push(e)
        })
      }
    })
  })

  let finalMessage = []

  Object.keys(lineItems).forEach((header) => {
    let items = lineItems[header]

    if (!items.length) {
      return
    }
    finalMessage.push(header)
    finalMessage.push('')

    if (header === '### Credits') {
      items = [...new Set(items)]
      let creditsMessage = `Huge thanks to `

      if (items.length > 1) {
        creditsMessage += items
          .slice(0, items.length - 1)
          .map((name) => `@${name}`)
          .join(`, `)
        creditsMessage += `, and `
      }
      creditsMessage += `@${items[items.length - 1]}`
      creditsMessage += ` for helping!`

      finalMessage.push(creditsMessage)
    } else {
      items.forEach((e) => finalMessage.push(e))
    }

    finalMessage.push('')
  })

  return {
    version: targetVersion.slice(0, -1),
    firstVersion: releases[0].tag_name,
    lastVersion: releases[releases.length - 1].tag_name,
    content: finalMessage.join('\n'),
  }
}

function categorizeCommits(commits) {
  const categories = createCategoriesStructure()

  commits.forEach((commit) => {
    const message = commit.commit.message
    const author = commit.author?.login || commit.commit.author.name
    const sha = commit.sha.substring(0, 7)

    // Extract commit message without merge info
    const cleanMessage = message.split('\n')[0]

    // Categorize based on commit message patterns
    if (cleanMessage.includes('feat:') || cleanMessage.includes('feature:')) {
      categories['### Core Changes'].push(
        `- ${cleanMessage} (${author}, ${sha})`
      )
    } else if (
      cleanMessage.includes('fix:') ||
      cleanMessage.includes('bugfix:')
    ) {
      categories['### Patches'].push(`- ${cleanMessage} (${author}, ${sha})`)
    } else if (
      cleanMessage.includes('docs:') ||
      cleanMessage.includes('documentation:')
    ) {
      categories['### Documentation Changes'].push(
        `- ${cleanMessage} (${author}, ${sha})`
      )
    } else if (
      cleanMessage.includes('example:') ||
      cleanMessage.includes('examples:')
    ) {
      categories['### Example Changes'].push(
        `- ${cleanMessage} (${author}, ${sha})`
      )
    } else if (
      cleanMessage.includes('chore:') ||
      cleanMessage.includes('refactor:')
    ) {
      categories['### Minor Changes'].push(
        `- ${cleanMessage} (${author}, ${sha})`
      )
    } else {
      categories['### Misc Changes'].push(
        `- ${cleanMessage} (${author}, ${sha})`
      )
    }

    // Extract contributors for credits
    if (author && !categories['### Credits'].includes(author)) {
      categories['### Credits'].push(author)
    }
  })

  return categories
}

function formatCommitLog(categorizedCommits, fromVersion, toVersion) {
  let finalMessage = []

  // Add header
  finalMessage.push(`# Changes between ${fromVersion} and ${toVersion}`)
  finalMessage.push('')

  Object.keys(categorizedCommits).forEach((header) => {
    const items = categorizedCommits[header]

    if (!items.length) {
      return
    }

    finalMessage.push(header)
    finalMessage.push('')

    if (header === '### Credits') {
      const uniqueCredits = [...new Set(items)]
      let creditsMessage = `Huge thanks to `

      if (uniqueCredits.length > 1) {
        creditsMessage += uniqueCredits
          .slice(0, uniqueCredits.length - 1)
          .map((name) => `@${name}`)
          .join(`, `)
        creditsMessage += `, and `
      }
      creditsMessage += `@${uniqueCredits[uniqueCredits.length - 1]}`
      creditsMessage += ` for helping!`

      finalMessage.push(creditsMessage)
    } else {
      items.forEach((item) => finalMessage.push(item))
    }

    finalMessage.push('')
  })

  return finalMessage.join('\n')
}

main().then((result) => {
  console.log(result.content)
})
