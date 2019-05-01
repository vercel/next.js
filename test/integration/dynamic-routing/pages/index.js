import Link from 'next/link'

export default () => (
  <div>
    <p>My blog</p>
    <Link href='$post' as='/post-1'>
      <a>View post 1</a>
    </Link>
    <br />
    <Link href='$post/comments' as='/post-1/comments'>
      <a>View post 1 comments</a>
    </Link>
    <br />
    <Link href='$post/$comment' as='/post-1/comment-1'>
      <a>View comment 1 on post 1</a>
    </Link>
  </div>
)
