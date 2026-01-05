import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  searchDiscussions,
  getCreateDiscussionUrl,
} from '@/lib/github/discussions'
import { findSimilarDiscussions } from '@/lib/similarity'
import { DiscussionList } from '@/components/discussion-list'
import { DiscussionCardSkeleton } from '@/components/ui/skeleton'
import { env } from '@/lib/env'

interface SearchPageProps {
  searchParams: Promise<{
    title?: string
    description?: string
    category?: string
  }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const { title, description, category } = params

  if (!title) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">
            No search query provided
          </h2>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchResults
        title={title}
        description={description}
        category={category}
      />
    </Suspense>
  )
}

async function SearchResults({
  title,
  description,
  category,
}: {
  title: string
  description?: string
  category?: string
}) {
  // Fetch all discussions from the repository
  const allDiscussions = await searchDiscussions()

  // Find similar discussions using string similarity
  const similarDiscussions = findSimilarDiscussions(
    allDiscussions,
    title,
    description
  )

  const hasGoodMatches =
    similarDiscussions.length > 0 &&
    similarDiscussions[0].score >= env.SIMILARITY_THRESHOLD

  const createUrl = getCreateDiscussionUrl(title, description, category)
  // If no matches found, redirect to GitHub new discussion page
  if (!hasGoodMatches) {
    redirect(createUrl)
  }

  return (
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            {env.GITHUB_REPO} Discussions
          </h1>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-muted-foreground">
              We found {similarDiscussions.length} discussion(s) that might be
              related to the problem you're facing. If relevant, please chime in
              there rather than creating a new discussion:
            </p>
            <DiscussionList discussions={similarDiscussions} />
          </div>
          <div className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">
              Don't see what you're looking for?{' '}
              <a
                href={createUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Create a new discussion.
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

function SearchPageSkeleton() {
  return (
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-4">
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          <div className="space-y-2">
            <div className="h-6 w-full bg-muted animate-pulse rounded" />
            <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <DiscussionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  )
}
