import Link from 'next/link'

export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return {
    props: { a: 'b' },
  }
}

export default function IdPage({ params }) {
  if (params.id === '123') {
    return (
      <>
        IdPage: {params.id}
        <Link href="/dashboard/456">To 456</Link>
      </>
    )
  }

  return (
    <>
      IdPage: {params.id}
      <Link href="/dashboard/123">To 123</Link>
    </>
  )
}
