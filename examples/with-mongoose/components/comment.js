import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'

import { commentShape } from 'libs/prop-types'
import { formatRelativeTime } from 'libs/format-relative-time'

const Comment = ({ comment }) => {
  const timeAgo = useMemo(() => formatRelativeTime(comment.createdAt), [
    comment,
  ])

  return (
    <li className="media">
      <img
        className="mr-3"
        src={`https://api.adorable.io/avatars/64/${encodeURIComponent(
          comment.nickname
        )}`}
        alt={comment.nickname}
      />
      <div className="media-body">
        <h5 className="mt-0">{comment.nickname}</h5>
        <small className="text-mono">
          Commented <time dateTime={comment.createdAt}>{timeAgo}</time>
        </small>
        <section>
          <ReactMarkdown source={comment.body} />
        </section>
      </div>
    </li>
  )
}

Comment.propTypes = {
  comment: commentShape,
}

export default Comment
