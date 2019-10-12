import Link from 'next/link'

export default () => (
  <>
    <p id='home'>Home</p>
    <Link href='/another'>
      <a id='to-another'>another</a>
    </Link>
    <Link href='/something'>
      <a id='to-something'>something</a>
    </Link>
  </>
)
