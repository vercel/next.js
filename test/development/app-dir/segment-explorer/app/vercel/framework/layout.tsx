import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1>Layout - /vercel/framework</h1>
      {children}
      <Link href="/vercel">To /vercel</Link>
    </div>
  )
}
