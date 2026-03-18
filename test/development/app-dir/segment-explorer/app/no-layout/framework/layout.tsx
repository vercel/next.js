import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1>Layout - /no-layout/framework</h1>
      {children}
      <Link href="/no-layout">To /no-layout</Link>
    </div>
  )
}
