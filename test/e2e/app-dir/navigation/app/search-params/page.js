import Link from 'next/link'

export default async function page({ searchParams }) {
  return (
    <div>
      <p id="name">{(await searchParams).name ?? ''}</p>
      <Link id="link" href="/">
        home
      </Link>
    </div>
  )
}
