// A script to sync the Next.js top issues to an internal Notion database

import { Client } from '@notionhq/client'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const NOTION_TOKEN = process.env.NOTION_TOKEN
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID

const notion = new Client({ auth: NOTION_TOKEN })

// Notion DB Schema
// Name: Title
// Issue Number: Number
// Upvotes: Number
// Link: URL
// Created At: Date
// Updated At: Date

async function getGithubIssues() {
  const url = `https://api.github.com/repos/vercel/next.js/issues?state=open&sort=comments&direction=desc&per_page=100&type=issue`

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  })
  const data = await response.json()

  return data
}

async function getNotionIssues() {
  const response = await notion.databases.query({
    database_id: NOTION_DATABASE_ID,
  })

  return response.results
}

/*
 * Sync the data between GitHub and Notion
 * 1. Fetch the data from both the sources
 * 2. Compare the data
 * 3. Create new issues in Notion
 * 4. Update existing issues in Notion
 *
 * TODO:
 * - Delete issues in Notion that are closed in GitHub
 * - handle pull requests better
 * - find a nice way of putting the body of the issue in Notion
 */
async function syncData() {
  const githubIssues = await getGithubIssues()

  console.log(`Fetched ${githubIssues.length} issues from GitHub...`)

  const notionIssues = await getNotionIssues()

  console.log(`Fetched ${notionIssues.length} issues from Notion...`)

  const toCreate = githubIssues.filter(
    (issue) =>
      !notionIssues.find(
        (ni) => ni.properties['Issue Number'].number === issue.number
      )
  )

  const toUpdate = githubIssues.filter((issue) =>
    notionIssues.find(
      (ni) =>
        ni.properties['Issue Number'].number === issue.number &&
        ni.properties['Upvotes'].number !== issue.reactions['+1']
    )
  )

  console.log(`Creating ${toCreate.length} new issues...`)
  console.log(`Updating ${toUpdate.length} existing issues...`)

  await Promise.all([
    ...toCreate.map((issue) =>
      notion.pages.create({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          Title: {
            title: [{ text: { content: issue.title } }],
          },
          'Issue Number': {
            number: issue.number,
          },
          'Total Reactions': {
            number: issue.reactions.total_count,
          },
          Upvotes: {
            number: issue.reactions['+1'],
          },
          URL: {
            url: issue.html_url,
          },
          Created: {
            date: {
              start: issue.created_at,
            },
          },
          'Last Updated': {
            date: {
              start: issue.updated_at,
            },
          },
          'Comments Count': {
            number: issue.comments,
          },
          Type: {
            select: {
              name: issue.pull_request ? 'PR' : 'Issue',
            },
          },
        },
      })
    ),
    ...toUpdate.map((issue) => {
      const notionIssue = notionIssues.find(
        (ni) => ni.properties['Issue Number'].number === issue.number
      )

      return notion.pages.update({
        page_id: notionIssue.id,
        properties: {
          Title: {
            title: [{ text: { content: issue.title } }],
          },
          'Total Reactions': {
            number: issue.reactions.total_count,
          },
          Upvotes: {
            number: issue.reactions['+1'],
          },
          URL: {
            url: issue.html_url,
          },
          Created: {
            date: {
              start: issue.created_at,
            },
          },
          'Last Updated': {
            date: {
              start: issue.updated_at,
            },
          },
          'Comments Count': {
            number: issue.comments,
          },
          Type: {
            select: {
              name: issue.pull_request ? 'PR' : 'Issue',
            },
          },
        },
      })
    }),
  ])

  console.log('Sync complete!')
}

await syncData()
