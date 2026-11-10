import Link from 'next/link'

const Home = () => (
  <div>
    <Link
      href="/single/[slug]"
      as={encodeURI('/single/hello world ')}
      id="single-spaces"
    >
      Single: Spaces
    </Link>
    <br />
    <Link
      href="/single/[slug]"
      as={encodeURI('/single/hello%world')}
      id="single-percent"
    >
      Single: Percent
    </Link>
    <br />
    <Link
      href="/single/[slug]"
      as={`/single/hello${encodeURIComponent('/')}world`}
      id="single-slash"
    >
      Single: Forward Slash
    </Link>
    <br />
    <Link
      href="/single/[slug]"
      as={`/single/hello${encodeURIComponent('"')}world`}
      id="single-double-quote"
    >
      Single: "
    </Link>
    <br />
    <Link
      href="/single/[slug]"
      as={`/single/hello${encodeURIComponent(':')}world`}
      id="single-colon"
    >
      Single: :
    </Link>
    <br />
    <Link href="/query?id=http://example.com/" id="url-param">
      Url query param
    </Link>
  </div>
)

export default Home
