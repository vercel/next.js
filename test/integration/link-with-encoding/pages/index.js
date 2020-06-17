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
  </div>
)

export default Home
