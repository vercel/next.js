import Link from 'next/link'

export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '400px',
      }}
    >
      <Link href="/next-dynamic/nodejs">/next-dynamic/nodejs</Link>
      <Link href="/next-dynamic/edge">/next-dynamic/edge</Link>
      <Link href="/dynamic-import/nodejs">/dynamic-import/nodejs</Link>
      <Link href="/dynamic-import/edge">/dynamic-import/edge</Link>
    </div>
  )
}
