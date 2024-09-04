import Link from 'next/link'

export default function Home({
  params: { locale },
}: {
  params: { locale: string }
}) {
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
