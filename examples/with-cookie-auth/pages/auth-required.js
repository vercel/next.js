import Link from 'next/link'

const Home = () => {
  return (
    <>
      <h1>Auth Required</h1>

      <p>You need to be authenticated to access this page</p>
      <div>
        <Link href="/">
          <a>go home</a>
        </Link>
      </div>
    </>
  )
}

export default Home
