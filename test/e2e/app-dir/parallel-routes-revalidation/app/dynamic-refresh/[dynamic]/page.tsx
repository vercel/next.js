import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <Link href="/dynamic-refresh/foo/login">
        <button>Login button</button>
      </Link>
      <div>
        Random # from Root Page: <span id="random-number">{Math.random()}</span>
      </div>
    </main>
  )
}
