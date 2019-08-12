import Link from 'next/link'

export default function PrefetchFalsePage () {
  return (
    <div>
      <Link href='/about' prefetch={false}>
        <a>Prefetch set to false</a>
      </Link>
    </div>
  )
}
