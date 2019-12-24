import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps() {
  return {
    props: { world: 'world', time: new Date().getTime() },
    // bad-prop
    revalidate: 1,
  }
}

const Page = ({ world, time }) => {
  return (
    <>
      <p>hello {world}</p>
      <span>time: {time}</span>
      <Link href="/another">
        <a id="another">to another</a>
      </Link>
      <br />
      <Link href="/something">
        <a id="something">to something</a>
      </Link>
      <br />
      <Link href="/normal">
        <a id="normal">to normal</a>
      </Link>
      <br />
      <Link href="/blog/[post]" as="/blog/post-1">
        <a id="post-1">to dynamic</a>
      </Link>
      <Link href="/blog/[post]" as="/blog/post-100">
        <a id="broken-post">to broken</a>
      </Link>
      <br />
      <Link href="/blog/[post]/[comment]" as="/blog/post-1/comment-1">
        <a id="comment-1">to another dynamic</a>
      </Link>
    </>
  )
}

export default Page
