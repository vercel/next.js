import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="page">Page</p>
      <Link href="/template/servercomponent/other" id="link">
        To Other
      </Link>
    </>
  )
}
