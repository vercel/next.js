import Link from 'next/link'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return { title: `${locale} not found` }
}

export default function NotFound() {
  return (
    <>
      <h1>Dynamic not-found boundary</h1>
      <Link href="/en/known" id="known">
        Known
      </Link>
    </>
  )
}
