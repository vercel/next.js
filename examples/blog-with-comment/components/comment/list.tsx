import type { Comment } from '../../types'
import distanceToNow from '../../lib/dateRelative'
import { useSession } from 'next-auth/react'

type CommentListProps = {
  comments?: Comment[]
  onDelete: (comment: Comment) => Promise<void>
}

export default function CommentList({ comments, onDelete }: CommentListProps) {
  const { data: session } = useSession()

  return (
    <div className="space-y-6 mt-10">
      {comments.map((comment) => {
        const isAuthor = session && session.user['id'] === comment.user.id
        const isAdmin = session && session.user['role'] === 'admin'

        return (
          <div key={comment.created_at} className="flex space-x-4">
            <div className="flex-shrink-0">
              <img
                src={comment.user.image}
                alt={comment.user.name}
                width={40}
                height={40}
                className="rounded-full"
              />
            </div>

            <div className="flex-grow">
              <div className="flex space-x-2">
                <b>{comment.user.name}</b>
                <time className="text-gray-400">
                  {distanceToNow(comment.created_at)}
                </time>
                {(isAdmin || isAuthor) && (
                  <button
                    className="text-gray-400 hover:text-red-500"
                    onClick={() => onDelete(comment)}
                    aria-label="Close"
                  >
                    x
                  </button>
                )}
              </div>

              <div>{comment.text}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
