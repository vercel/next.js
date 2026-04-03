import Link from 'next/link'

export default function PageA() {
  return (
    <div>
      <p>Page A Content</p>
      <Link href="/does-not-exist" id="link-to-nonexistent">
        Go to nonexistent page
      </Link>
    </div>
  )
}
