import Link from 'next/link'

export const config = { experimentalPrerender: true }

const Page = ({ world }) => {
  return (
    <>
      <p>hello {world}</p>
      <Link href='/another'>
        <a id='another'>to another</a>
      </Link>
      <br />
      <Link href='/something'>
        <a id='something'>to something</a>
      </Link>
      <br />
      <Link href='/normal'>
        <a id='normal'>to normal</a>
      </Link>
      <br />
      <Link href='/blog/[post]' as='/blog/post-1'>
        <a id='post-1'>to dynamic</a>
      </Link>
      <br />
      <Link href='/blog/[post]/[comment]' as='/blog/post-1/comment-1'>
        <a id='comment-1'>to another dynamic</a>
      </Link>
    </>
  )
}

Page.getInitialProps = () => ({ world: 'world' })

export default Page
