import { setFailed, debug } from '@actions/core'
import { context, getOctokit } from '@actions/github'

type GitHubClient = ReturnType<typeof getOctokit>['rest']

async function run() {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('No GITHUB_TOKEN provided')

  const { issue } = context.payload
  if (!issue) return console.log('Not an issue, exiting')

  const { body: issue_body, number: issue_number, title: issue_title } = issue
  if (!issue_number) return console.log('Could not get issue number, exiting')
  if (!issue_body) return console.log('Could not get issue body, exiting')
  if (!issue_title) return console.log('Could not get issue title, exiting')

  // A client to load data from GitHub
  const { rest: client } = getOctokit(token)

  // Load our regex rules from the repo labels
  const labels = await loadAreaLabels(client)

  debug(`Loaded labels: ${Array.from(labels.keys()).join(', ')}`)

  /** List of labels to add */
  const toAdd: string[] = []

  // https://github.com/vercel/next.js/blame/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml

  const matchSection = issue_body
    .split('Which area(s) of Next.js are affected? (leave empty if unsure)')[1]
    ?.split('Link to the code that reproduces this issue')[0]

  if (!matchSection) {
    console.log(
      `Issue #${issue_number} does not contain a match section, likely not a bug template, exiting`
    )
    return
  }

  debug(`Match section: ${matchSection}`)

  for (const [label, description] of labels.entries()) {
    if (matchSection.includes(description)) {
      toAdd.push(label)
    }
  }

  debug(`Labels to add: ${toAdd.join(', ')}`)

  if (!toAdd.length) return console.log('No labels to add, exiting')

  await addLabels(client, issue_number, toAdd)

  debug(`Added labels to issue #${issue_number}: ${toAdd.join(', ')}`)
}

/** Load label descriptions from the repo. */
async function loadAreaLabels(client: GitHubClient) {
  try {
    const { data } = await client.issues.listLabelsForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 100,
    })

    const labels = new Map<string, string>()
    // Only load labels that start with `area:` and have a description
    for (const label of data) {
      if (label.name.startsWith('area:') && label.description) {
        labels.set(label.name, label.description)
      }
    }
    return labels
  } catch (error) {
    console.error('Error loading labels: ' + error)
    throw error
  }
}

async function addLabels(
  client: GitHubClient,
  issue_number: number,
  labels: string[]
) {
  try {
    const formatted = labels.map((l) => `"${l}"`).join(', ')
    debug(`Adding label(s) (${formatted}) to issue #${issue_number}`)
    return await client.issues.addLabels({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number,
      labels,
    })
  } catch (error) {
    console.error(`Could not add label(s) ${labels} to issue #${issue_number}`)
    throw error
  }
}

run().catch(setFailed)
