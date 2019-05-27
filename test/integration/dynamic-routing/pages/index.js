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
    <Link href='/blog/$post/comment/$id$' as='/blog/543/comment'>
      <a id='view-blog-post-1-comments'>View all comments on blog post 543</a>
    </Link>
    <br />
    <Link href='/blog/$post/comment/$id$' as='/blog/321/comment/123'>
      <a id='view-nested-dynamic-cmnt'>View comment 123 on blog post 321</a>
    </Link>
  </div>
)
