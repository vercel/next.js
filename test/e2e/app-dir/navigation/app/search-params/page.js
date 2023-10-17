import Link from 'next/link'

export default function page({ searchParams }) {
  return (
    <div>
      <p id="name">{searchParams.name ?? ''}</p>
      <Link id="link" href="/">
        home
      </Link>
    </div>
  )
}
