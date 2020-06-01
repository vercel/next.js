import Link from 'next/link'

export async function getServerSideProps({ req }) {
  return {
    props: {
      url: req.url,
      world: 'world',
      time: new Date().getTime(),
    },
  }
}

const Page = ({ world, time, url }) => {
  if (typeof window === 'undefined') {
    if (url.startsWith('/_next/data/')) {
      throw new Error('invalid render for data request')
    }
  }

  return (
    <>
      <p>hello {world}</p>
      <span>time: {time}</span>
      <Link href="/non-json">
        <a id="non-json">to non-json</a>
      </Link>
      <br />
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
      <Link href="/something?another=thing">
        <a id="something-query">to something?another=thing</a>
      </Link>
    </>
  )
}

export default Page
