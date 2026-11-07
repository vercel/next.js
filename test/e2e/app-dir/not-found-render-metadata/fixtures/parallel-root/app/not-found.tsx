import Link from 'next/link'

export async function generateMetadata() {
  return {
    title: { absolute: 'Parallel not-found title' },
    description: 'Not-found boundary description',
    openGraph: { title: 'Not-found social title' },
  }
}

export default function NotFound() {
  return (
    <>
      <h1>Not-found boundary UI</h1>
      <Link href="/known" id="known">
        Known
      </Link>
    </>
  )
}
