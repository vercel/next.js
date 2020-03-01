import Link from 'next/link'

export default () => {
  return (
    <p>
      <Link href="/first" as="/first#different">
        <a>to /first</a>
      </Link>
    </p>
  )
}
