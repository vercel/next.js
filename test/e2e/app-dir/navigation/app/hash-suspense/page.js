import Link from 'next/link'

export default function HashSuspensePage() {
  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: '16px' }}>
      <p>Hash Suspense Page</p>
      <Link
        href="/hash-suspense/with-suspense#hash-target"
        id="link-to-suspense-hash"
      >
        To hash target inside a Suspense boundary
      </Link>
    </div>
  )
}
