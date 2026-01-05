import { getOctokit } from './client'
import { env } from '@/lib/env'
import type { Discussion, GraphQLDiscussionResponse } from './types'
import { unstable_cache } from 'next/cache'

async function fetchDiscussionsFromGitHub(): Promise<Discussion[]> {
  const octokit = getOctokit()
  const [owner, repo] = env.GITHUB_REPO.split('/')
  const maxToFetch = env.MAX_DISCUSSIONS_TO_FETCH
  const perPage = 100 // GitHub's max per page

  const query = `
    query($owner: String!, $name: String!, $first: Int!, $after: String) {
      repository(owner: $owner, name: $name) {
        discussions(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            id
            title
            body
            url
            createdAt
            author {
              login
            }
            category {
              name
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `

  try {
    const allDiscussions: Discussion[] = []
    let hasNextPage = true
    let cursor: string | null = null
    let fetched = 0

    while (hasNextPage && fetched < maxToFetch) {
      const remaining = maxToFetch - fetched
      const toFetch = Math.min(remaining, perPage)

      const response: GraphQLDiscussionResponse = await octokit.graphql(query, {
        owner,
        name: repo,
        first: toFetch,
        after: cursor,
      })

      const discussions = response.repository.discussions.nodes
      allDiscussions.push(...discussions)
      fetched += discussions.length

      hasNextPage = response.repository.discussions.pageInfo.hasNextPage
      cursor = response.repository.discussions.pageInfo.endCursor

      // Break if we got fewer results than requested (end of data)
      if (discussions.length < toFetch) {
        break
      }
    }

    console.log(
      `Fetched ${allDiscussions.length} discussions from ${owner}/${repo}`
    )
    return allDiscussions
  } catch (error: any) {
    // Check for rate limiting.
    // Practically, this should not happen as we cache the results and retrieve 100 items at a time.
    if (
      error?.status === 403 &&
      error?.response?.headers?.['x-ratelimit-remaining'] === '0'
    ) {
      const resetTime = error.response.headers['x-ratelimit-reset']
      const resetDate = new Date(parseInt(resetTime) * 1000)
      throw new Error(
        `GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`
      )
    }

    console.error('Error fetching discussions:', error)
    throw new Error('Failed to fetch discussions from GitHub')
  }
}

// Cache discussions for 5 minutes to avoid rate limiting
export const searchDiscussions = unstable_cache(
  fetchDiscussionsFromGitHub,
  ['github-discussions'],
  {
    revalidate: 300, // 5 minutes
    tags: ['discussions'],
  }
)

export function getCreateDiscussionUrl(
  title: string,
  description?: string,
  category?: string
): string {
  const baseUrl = `https://github.com/${env.GITHUB_REPO}/discussions/new`
  const params = new URLSearchParams({
    title,
  })
  if (description) {
    params.set('body', description)
  }
  if (category) {
    params.set('category', category)
  }
  return `${baseUrl}?${params.toString()}`
}
