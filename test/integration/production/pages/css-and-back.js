import Link from 'next/link'

const Page = ({ from }) => (
  <div>
    <p>{from}</p>
    <Link href="/css-modules">Page with CSS</Link>
  </div>
)

Page.getInitialProps = () => {
  return { from: typeof window === 'undefined' ? 'server' : 'client' }
}

export default Page
