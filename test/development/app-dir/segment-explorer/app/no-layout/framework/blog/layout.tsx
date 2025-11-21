import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h2>Layout - /no-layout/framework/blog</h2>
      {children}
      <Link href="/no-layout/framework">To /no-layout/framework</Link>
    </div>
  )
}
