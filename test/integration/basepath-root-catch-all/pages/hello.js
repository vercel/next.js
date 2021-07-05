import Link from 'next/link'

const Hello = () => (
  <Link href="/[...parts]" as="/root/catch-all">
    <a id="root-catchall-link">root catch-all</a>
  </Link>
)

export default Hello
