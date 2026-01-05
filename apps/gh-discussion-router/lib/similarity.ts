import { stringSimilarity } from 'string-similarity-js'
import type { Discussion } from './github/types'
import { env } from './env'

export interface SimilarDiscussion {
  discussion: Discussion
  score: number
  titleScore: number
  bodyScore: number
}

export function findSimilarDiscussions(
  discussions: Discussion[],
  searchTitle: string,
  searchDescription?: string
): SimilarDiscussion[] {
  const results: SimilarDiscussion[] = discussions.map((discussion) => {
    // Calculate title similarity
    const titleScore = stringSimilarity(
      searchTitle.toLowerCase(),
      discussion.title.toLowerCase()
    )

    // Calculate body similarity if description provided
    let bodyScore = 0
    if (searchDescription && discussion.body) {
      bodyScore = stringSimilarity(
        searchDescription.toLowerCase(),
        discussion.body.toLowerCase()
      )
    }

    // Combined score: 70% title, 30% body
    const combinedScore = searchDescription
      ? titleScore * 0.7 + bodyScore * 0.3
      : titleScore

    return {
      discussion,
      score: combinedScore,
      titleScore,
      bodyScore,
    }
  })

  // Filter by threshold and sort by score descending
  return results
    .filter((result) => result.score >= env.SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
}

export function formatSimilarityScore(score: number): string {
  return `${Math.round(score * 100)}%`
}
