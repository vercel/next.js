import Link from 'next/link'

const NotDeDuped = () => {
  return (
    <p>
      <Link href="/first" as="/first#different">
        <a>to /first</a>
      </Link>
    </p>
  )
}

export default NotDeDuped
