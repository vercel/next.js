import Link from 'next/link'

export default function Page() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1500px',
        minHeight: '100%',
      }}
    >
      <Link href="/non-existent-route" className="non-existent-route">
        non-existent-route
      </Link>
      <Link href="/trigger-not-found" className="trigger-not-found">
        trigger-not-found
      </Link>
    </div>
  )
}
