import Link from 'next/link'

const OptOut = () => (
  <div>
    <Link prefetch={false} href="/another">
      <a>I'm not pre-fetched..</a>
    </Link>
  </div>
)

export default OptOut
