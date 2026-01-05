import type { Discussion } from '@/lib/github/types'
import { formatDate } from '@/lib/utils'
import { formatSimilarityScore } from '@/lib/similarity'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, User, Calendar } from 'lucide-react'

interface DiscussionCardProps {
  discussion: Discussion
  score: number
}

export function DiscussionCard({ discussion, score }: DiscussionCardProps) {
  return (
    <a
      href={discussion.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-6 border border-border rounded-lg hover:border-primary transition-colors bg-card"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-card-foreground flex-1">
            {discussion.title}
          </h3>
          <Badge variant="secondary">
            {formatSimilarityScore(score)} match
          </Badge>
        </div>

        {discussion.body && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {discussion.body}
          </p>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {discussion.author && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{discussion.author.login}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(discussion.createdAt)}</span>
          </div>
          {discussion.category && (
            <Badge variant="outline" className="text-xs">
              {discussion.category.name}
            </Badge>
          )}
          <ExternalLink className="h-3 w-3 ml-auto" />
        </div>
      </div>
    </a>
  )
}
