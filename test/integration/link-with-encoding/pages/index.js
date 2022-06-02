import Link from 'next/link'

const Home = () => (
  <div>
    <Link href="/single/[slug]" as={encodeURI('/single/hello world ')}>
      <a id="single-spaces">Single: Spaces</a>
    </Link>
    <br />
    <Link href="/single/[slug]" as={encodeURI('/single/hello%world')}>
      <a id="single-percent">Single: Percent</a>
    </Link>
    <br />
    <Link
      href="/single/[slug]"
      as={`/single/hello${encodeURIComponent('/')}world`}
    >
      <a id="single-slash">Single: Forward Slash</a>
    </Link>
    <br />
    <Link
      href="/single/[slug]"
      as={`/single/hello${encodeURIComponent('"')}world`}
    >
      <a id="single-double-quote">Single: "</a>
    </Link>
    <br />
    <Link
      href="/single/[slug]"
      as={`/single/hello${encodeURIComponent(':')}world`}
    >
      <a id="single-colon">Single: :</a>
    </Link>
    <br />
    <Link href="/query?id=http://example.com/">
      <a id="url-param">Url query param</a>
    </Link>
  </div>
)

export default Home
