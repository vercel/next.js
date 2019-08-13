import Link from 'next/link'

export const config = { experimentalPrerender: true }

const Comment = ({ data }) => (
  <>
    <p>Comment: {data}</p>
    <Link href='/'>
      <a id='home'>to home</a>
    </Link>
  </>
)

Comment.getInitialProps = () => ({
  data: typeof window === 'undefined' ? 'SSR' : 'CSR'
})

export default Comment
