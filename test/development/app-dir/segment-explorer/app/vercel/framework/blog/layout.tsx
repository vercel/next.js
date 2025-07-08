import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h2>Layout - /vercel/framework/blog</h2>
      {children}
      <Link href="/vercel/framework">To /vercel/framework</Link>
    </div>
  )
}
