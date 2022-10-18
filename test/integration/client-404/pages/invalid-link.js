import Link from 'next/link'

export default () => (
  <Link
    href="/[id]/non-existent"
    as="/another/non-existent"
    id="to-nonexistent"
  >
    to 404
  </Link>
)
