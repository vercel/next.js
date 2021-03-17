import Link from 'next/link'

const Page = ({ from }) => (
  <div>
    <p>{from}</p>
    <Link href="/css-modules">
      <a>Page with CSS</a>
    </Link>
  </div>
)

Page.getInitialProps = () => {
  return { from: typeof window === 'undefined' ? 'server' : 'client' }
}

export default Page
