import Link from 'next/link'

export const config = { experimentalPrerender: true }

const Page = ({ world }) => {
  return (
    <>
      <p>hello {world}</p>
      <Link href='/'>
        <a id='home'>to home</a>
      </Link>
      <br />
      <Link href='/something'>
        <a id='somethin'>to something</a>
      </Link>
    </>
  )
}

Page.getInitialProps = () => ({ world: 'world' })

export default Page
