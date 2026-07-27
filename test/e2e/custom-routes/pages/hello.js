import Link from 'next/link'

const Page = () => (
  <>
    <h3 id="hello">Hello</h3>
    <Link href="/nav" id="to-nav">
      to nav
    </Link>
  </>
)

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
