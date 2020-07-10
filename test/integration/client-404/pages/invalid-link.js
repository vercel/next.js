import Link from 'next/link'

export default () => (
  <Link href="/[id]/non-existent" as="/another/non-existent">
    <a id="to-nonexistent">to 404</a>
  </Link>
)
