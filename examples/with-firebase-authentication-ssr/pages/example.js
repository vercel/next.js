import Link from 'next/link'

const Example = (props) => {
  return (
    <div>
      <p>
        This page is static. It does not fetch any data or use the authed user.
      </p>
      <Link href={'/'}>
        <a>Home</a>
      </Link>
    </div>
  )
}

export default Example
