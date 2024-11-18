import { getExecOutput } from '@actions/exec'
import { setFailed } from '@actions/core'

// format date to <month|short> <day|numeric>, <year|numeric>
export function formattedDate(createdAt) {
  const date = new Date(createdAt)

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Get the date 90 days ago (YYYY-MM-DD)
export function ninetyDaysAgo() {
  const date = new Date()
  date.setDate(date.getDate() - 90)
  return date.toISOString().split('T')[0]
}

export async function getLatestCanaryVersion() {
  let latestCanaryVersion

  try {
    const { stdout } = await getExecOutput('pnpm', [
      'view',
      'next',
      'dist-tags',
      '--json',
    ])

    const distTags = JSON.parse(stdout)
    latestCanaryVersion = distTags.canary || null
  } catch (error) {
    setFailed(`Error fetching latest Next.js canary version, skipping update.`)
  }

  return latestCanaryVersion
}

export async function getLatestVersion() {
  let latestVersion

  try {
    const { stdout } = await getExecOutput('pnpm', [
      'view',
      'next',
      'dist-tags',
      '--json',
    ])

    const distTags = JSON.parse(stdout)
    latestVersion = distTags.latest || null
  } catch (error) {
    setFailed(`Error fetching latest Next.js version, skipping update.`)
  }

  return latestVersion
}
