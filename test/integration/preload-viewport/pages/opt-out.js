import Link from 'next/link'

export default () => (
  <div>
    <Link prefetch={false} href="/another">
      I'm not pre-fetched..
    </Link>
  </div>
)
