// section -> label
const sectionLabelMap = {
  'Core Changes': 'type: next',
  'Documentation Changes': 'area: documentation',
  'Example Changes': 'area: examples',
}

const fallbackSection = 'Misc Changes'

// --------------------------------------------------

const prNumberRegex = /\(#([-0-9]+)\)$/

const getCommitPullRequest = async (commit, github) => {
  const match = prNumberRegex.exec(commit.title)

  if (!match) return null

  const number = parseInt(match[1], 10)

  if (!number) return null

  if(!github.connection) return null

  try {
    const { data } = await github.connection.pullRequests.get({
      owner: github.repoDetails.user,
      repo: github.repoDetails.repo,
      number,
    })
  
    return data
  } catch (error) {
    console.error(error)
    return null
  }
}

const getSectionForPullRequest = (pullRequest) => {
  const { labels } = pullRequest

  // sections defined first will take priority
  for (const [section, label] of Object.entries(sectionLabelMap)) {
    const labelExists = labels.some((prLabel) => prLabel.name === label);

    if (labelExists) {
      return section;
    }
  }

  return null
}

const groupByLabels = async (commits, github) => {
  // Initialize the sections object with empty arrays
  const sections = Object.keys(sectionLabelMap).reduce((sections, section) => {
    sections[section] = [];
    return sections;
  }, {});
  sections.__fallback = [];

  for (const commit of commits) {
    const pullRequest = await getCommitPullRequest(commit, github);

     // No Pull Request found, add it to the fallback section but without the number
    if (!pullRequest) {
      sections.__fallback.push({
        title: commit.title,
      });
      continue;
    }

    const section = getSectionForPullRequest(pullRequest);

    // No section found, add it to the fallback section
    if (!section) {
      sections.__fallback.push({
        title: pullRequest.title,
        number: pullRequest.number,
      });
      continue;
    }

    // Add the change to the respective section
    sections[section].push({
      title: pullRequest.title,
      number: pullRequest.number,
    });
  }

  return sections;
};

function cleanupPRTitle(title) {
  return title.replace(/^\[(Docs|docs)\] /, '');
}

const buildChangelog = (sectionChanges, authors) => {
  let text = ''

   // Iterate over each section
  for (const section in sectionChanges) {
    const changes = sectionChanges[section]

    // Skip this section if there are no changes
    if (changes.length === 0) {
      continue
    }

    // Determine the little for the section
    const sectionTitle = section === '__fallback' ? fallbackSection : section
    text += `### ${sectionTitle}\n\n`

     // Iterate over arch change in the section
    for (const change of changes) {
      const changeNumberText = change.number ? `: #${change.number}` : ''
      text += `- ${cleanupPRTitle(change.title)}${changeNumberText}\n`
    }

    text += '\n'
  }

  text += buildCreditsSection(authors)
  return text
}

const buildCreditsSection = (authors) => {
  if (authors.size === 0) {
    return ''
  }

  let creditsText = '### Credits \n\n'
  creditsText += 'Huge thanks to '

  let index = 1
  authors.forEach((author) => {
    // GitHub links usernames if prefixed with @
    creditsText += `@${author}`

    const penultimate = index === authors.size - 1
    const notLast = index !== authors.size

    if (penultimate) {
      // Oxford comma is applied when list is bigger than 2 names
      if (authors.size > 2) {
        creditsText += ','
      }

      creditsText += ' and '
    } else if (notLast) {
      creditsText += ', '
    }

    index += 1
  })

  creditsText += ' for helping!'
  creditsText += '\n'

  return creditsText
}

module.exports = async (markdown, { commits, authors, githubConnection, repoDetails }) => {
  const github = { connection: githubConnection, repoDetails }

  const sections = await groupByLabels(commits.all, github)
  const changelog = buildChangelog(sections, authors)

  return changelog
}
