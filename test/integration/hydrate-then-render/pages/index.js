import Link from 'next/link'

const Home = () => {
  return (
    <div>
      <h1>Foo!</h1>
      <h2>bar!</h2>
      <Link href="/other" id="to-other">
        Other
      </Link>
    </div>
  )
}

export default Home
