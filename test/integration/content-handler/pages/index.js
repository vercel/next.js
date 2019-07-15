import Link from 'next/link'

export const config = { contentHandler: true }

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
    </>
  )
}

Page.getInitialProps = () => ({ world: 'world' })

export default Page
