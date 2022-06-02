import Link from 'next/link'

export default () => (
  <>
    <p id="another">hi from another</p>
    <Link href="/">
      <a id="to-index">to index</a>
    </Link>
  </>
)
