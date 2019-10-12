import Link from 'next/link'

export default () => (
  <>
    <p id='something'>something</p>
    <Link href='/'>
      <a id='to-home'>home</a>
    </Link>
    <Link href='/another'>
      <a id='to-another'>another</a>
    </Link>
  </>
)
