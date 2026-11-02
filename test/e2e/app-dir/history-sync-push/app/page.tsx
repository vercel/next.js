import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>home</h1>
      <Link href="/slow" id="to-slow">
        go to slow
      </Link>
      <Link href="/redir" id="to-redir">
        go to redir
      </Link>
    </main>
  )
}
