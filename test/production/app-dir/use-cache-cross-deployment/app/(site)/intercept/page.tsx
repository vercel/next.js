import Link from 'next/link'

export default function Page() {
  return (
    <Link id="open-modal" href="/intercept/photo" prefetch={false}>
      Open intercepted route
    </Link>
  )
}
