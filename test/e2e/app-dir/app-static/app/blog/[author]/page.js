import Link from 'next/link'

export const config = {
  dynamicParams: false,
}

export default function Page({ params }) {
  return (
    <>
      <p id="page">/blog/[author]</p>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="date">{Date.now()}</p>
      <Link href="/blog/tim">
        <a id="author-1">/blog/tim</a>
      </Link>
      <br />
      <Link href="/blog/seb">
        <a id="author-2">/blog/seb</a>
      </Link>
      <br />
      <Link href="/blog/styfle">
        <a id="author-3">/blog/styfle</a>
      </Link>
      <br />

      <Link href="/blog/tim/first-post">
        <a id="author-1-post-1">/blog/tim/first-post</a>
      </Link>
      <br />
      <Link href="/blog/seb/second-post">
        <a id="author-2-post-1">/blog/seb/second-post</a>
      </Link>
      <br />
      <Link href="/blog/styfle/first-post">
        <a id="author-3-post-1">/blog/styfle/first-post</a>
      </Link>
      <br />

      <Link href="/dynamic-no-gen-params/first">
        <a id="dynamic-no-params">/dynamic-no-gen-params/first</a>
      </Link>
      <br />
    </>
  )
}
