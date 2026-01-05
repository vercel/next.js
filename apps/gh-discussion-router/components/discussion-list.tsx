'use client'

import { useState } from 'react'
import { DiscussionCard } from '@/components/discussion-card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { SimilarDiscussion } from '@/lib/similarity'

interface DiscussionListProps {
  discussions: SimilarDiscussion[]
  highMatchThreshold?: number
  maxInitialResults?: number
}

export function DiscussionList({
  discussions,
  highMatchThreshold = 0.7,
  maxInitialResults = 10,
}: DiscussionListProps) {
  const [showAll, setShowAll] = useState(false)

  const highMatchDiscussions = discussions.filter(
    (item) => item.score >= highMatchThreshold
  )
  const lowMatchDiscussions = discussions.filter(
    (item) => item.score < highMatchThreshold
  )

  // Limit initial results to maxInitialResults
  const initialDiscussions = highMatchDiscussions.slice(0, maxInitialResults)
  const additionalHighMatches = highMatchDiscussions.slice(maxInitialResults)
  const hiddenDiscussions = [...additionalHighMatches, ...lowMatchDiscussions]

  const displayedDiscussions = showAll ? discussions : initialDiscussions
  const hasHiddenResults = hiddenDiscussions.length > 0

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {displayedDiscussions.map((item) => (
          <DiscussionCard
            key={item.discussion.id}
            discussion={item.discussion}
            score={item.score}
          />
        ))}
      </div>

      {hasHiddenResults && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>
                <ChevronUp className="mr-2 h-4 w-4" />
                Show fewer results
              </>
            ) : (
              <>
                <ChevronDown className="mr-2 h-4 w-4" />
                Show {hiddenDiscussions.length} more result
                {hiddenDiscussions.length !== 1 ? 's' : ''}{' '}
                {lowMatchDiscussions.length > 0 && (
                  <>
                    (
                    {Math.round(
                      hiddenDiscussions[hiddenDiscussions.length - 1].score *
                        100
                    )}
                    % - {Math.round(hiddenDiscussions[0].score * 100)}% match)
                  </>
                )}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
