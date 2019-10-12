import Link from 'next/link'

export default () => (
  <>
    <p id='another'>Another</p>
    <Link href='/'>
      <a id='to-home'>home</a>
    </Link>
    <Link href='/something'>
      <a id='to-something'>something</a>
    </Link>
  </>
)
