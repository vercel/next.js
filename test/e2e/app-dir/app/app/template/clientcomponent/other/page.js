import Link from 'next/link'
export default function Page() {
  return (
    <>
      <p id="other-page">Other Page</p>
      <Link href="/template/clientcomponent">
        <a id="link">To Page</a>
      </Link>
    </>
  )
}
