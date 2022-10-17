import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="page">Page</p>
      <Link href="/template/clientcomponent/other">
        <a id="link">To Other</a>
      </Link>
    </>
  )
}
