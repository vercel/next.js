import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="page">Page</p>
      <Link href="/template/clientcomponent/other" id="link">
        To Other
      </Link>
    </>
  )
}
