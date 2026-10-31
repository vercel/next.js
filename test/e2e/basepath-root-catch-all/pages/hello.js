import Link from 'next/link'

export default () => (
  <Link href="/[...parts]" as="/root/catch-all" id="root-catchall-link">
    root catch-all
  </Link>
)
