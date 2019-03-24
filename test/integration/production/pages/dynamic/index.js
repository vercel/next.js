import Link from 'next/link'

export default () => (
  <div>
    <Link href='/dynamic/no-chunk'><a>No Chunk</a></Link>
    <Link href='/dynamic/missing'><a id='missing'>Missing</a></Link>
  </div>
)
