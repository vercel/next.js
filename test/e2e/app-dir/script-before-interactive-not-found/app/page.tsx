import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="home">home</p>
      <Link id="to-missing" href="/missing">
        missing
      </Link>
    </>
  )
}
