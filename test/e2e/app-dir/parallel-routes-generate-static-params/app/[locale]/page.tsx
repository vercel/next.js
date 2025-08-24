import Link from 'next/link'

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <div id="home-page">
      <h1>Home Page</h1>
      <br />
      <Link href={`/${locale}/interception/123`}>Interception link</Link>
      <br />
      <Link href={`/${locale}/no-interception/123`}>No interception link</Link>
    </div>
  )
}
