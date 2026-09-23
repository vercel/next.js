import Link from 'next/link'

export const metadata = { title: 'About - My Blog' }

export default function About() {
  return (
    <main>
      <h1>About My Blog</h1>
      <Link href="/">Home</Link>
    </main>
  )
}
