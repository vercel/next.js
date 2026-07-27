import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div
        style={{
          height: '100vh',
          color: 'red',
        }}
      ></div>
      <Link href="/parallel-scroll/nav">nav</Link>
    </div>
  )
}
