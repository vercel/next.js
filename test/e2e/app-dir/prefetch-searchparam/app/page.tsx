import Link from 'next/link'

export default function Page({ searchParams }: { searchParams: any }) {
  return (
    <>
      <Link href="/">/</Link>
      <Link href="/?q=bar">/?q=bar</Link>
      <p>{JSON.stringify(searchParams)}</p>
    </>
  )
}
