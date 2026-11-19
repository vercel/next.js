import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link id="to-on-mount" href="/on-mount">
        on mount
      </Link>
      <Link id="to-on-click" href="/on-click">
        on click
      </Link>
    </>
  )
}
