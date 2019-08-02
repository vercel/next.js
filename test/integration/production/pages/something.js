import Link from 'next/link'

export const config = {
  experimentalPrerender: 'inline'
}

const Page = ({ data }) => {
  return (
    <>
      <h3>{data}</h3>
      <Link href='/to-something'>
        <a id='to-something'>Click to to-something</a>
      </Link>
    </>
  )
}

Page.getInitialProps = async () => {
  if (typeof window !== 'undefined') {
    throw new Error(`this shouldn't be called`)
  }
  return {
    data: 'this is some data to be inlined!!!'
  }
}

export default Page
