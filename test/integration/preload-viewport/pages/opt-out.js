import Link from 'next/link'

export default () => (
  <div>
    <Link prefetch={false} href='/another'>
      <a>I'm not pre-fetched..</a>
    </Link>
  </div>
)
