import Link from 'next/link'

export default () => (
  <div>
    <h3>My blog</h3>
    <Link href='/$post' as='/post-1'>
      <a id='view-post-1'>View post 1</a>
    </Link>
    <br />
    <Link href='/$post/comments' as='/post-1/comments'>
      <a id='view-post-1-comments'>View post 1 comments</a>
    </Link>
    <br />
    <Link href='/$post/$comment' as='/post-1/comment-1'>
      <a id='view-post-1-comment-1'>View comment 1 on post 1</a>
    </Link>
    <br />
    <Link href='/cmnt-$id' as='/cmnt-123'>
      <a id='view-cmnt-part'>View comment 123</a>
    </Link>
    <br />
    <Link href='/blog/$post/cmnt-$id' as='/blog/321/cmnt-cmnt-123'>
      <a id='view-nested-cmnt-part'>View comment cmnt-123 on blog post 321</a>
    </Link>
  </div>
)
