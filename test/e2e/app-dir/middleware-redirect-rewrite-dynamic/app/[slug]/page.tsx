import Link from 'next/link'

// Dynamically rendered and reads the `[slug]` param.
export const dynamic = 'force-dynamic'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // slug === "a" means we're at / (proxy rewrites / -> /a).
  const isHome = slug === 'a'

  return (
    <main>
      <h1 data-testid="page">slug: {slug}</h1>

      {isHome ? (
        <p>
          This is the home page (<code>/</code>), served via a proxy rewrite from{' '}
          <code>/a</code>.
          <br />
          <Link href="/two">Go to /two to start the repro</Link>
        </p>
      ) : (
        <p>
          Repro: click the link below. The proxy redirects <code>/a</code> to{' '}
          <code>/</code>, so the URL should change to <code>/</code>.
          <br />
          <Link href="/a">Go to /a</Link>
        </p>
      )}
    </main>
  )
}
