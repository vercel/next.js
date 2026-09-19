import Link from 'next/link'

export default function PrefetchPage() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation Mode Demo</h1>
      <Link
        href="/target-page/my-post?search=foo"
        id="link-to-target-prefetch"
        prefetch={true}
        style={{
          display: 'inline-block',
          padding: '0.5rem 1rem',
          background: '#7c3aed',
          color: '#fff',
          borderRadius: 6,
          textDecoration: 'none',
        }}
      >
        Go to target page (prefetch) &rarr;
      </Link>
    </div>
  )
}
