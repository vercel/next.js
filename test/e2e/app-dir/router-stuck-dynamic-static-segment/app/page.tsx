import Link from 'next/link'

/** Add your relevant code here for the issue to reproduce */
export default function Home() {
  return (
    <div>
      <h1>Subpage linking issue reproduction</h1>
      <p>Reproducing:</p>
      <ol>
        <li>Press the "Go to blog" link</li>
        <li>Press the "Go to post" link</li>
        <li>
          <em>Expected behavior</em>: link should take you to the blog post
        </li>
        <li>
          <em>Actual behavior</em>: the browser fetches the data for the page
          but never navigates
        </li>
      </ol>
      <p>
        Reloading and pressing the "Go to another page" link and then going to
        the blog post does work however, suggesting the issue is navigating from{' '}
        <code>/blog</code> to <code>/blog/a-post</code> (<code>/[slug]</code>{' '}
        where slug is blog and <code>/blog/[slug]</code> where slug is a-post)
      </p>
      <Link href="/blog" style={{ display: 'block' }} id="to-blog">
        Go to blog
      </Link>
      <Link href="/another-page" style={{ display: 'block' }}>
        Go to another page
      </Link>
    </div>
  )
}
