import Link from 'next/link'

export default () => (
  <Link href="/[...parts]" as="/root/catch-all">
    <a id="root-catchall-link">root catch-all</a>
  </Link>
)
