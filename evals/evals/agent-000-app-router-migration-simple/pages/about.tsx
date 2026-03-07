import Head from 'next/head'

export default function About() {
  return (
    <>
      <Head>
        <title>About Us</title>
        <meta name="description" content="Learn more about us" />
      </Head>
      <main>
        <h1>About</h1>
        <p>This is the about page of our Next.js application.</p>
        <nav>
          <ul>
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href="/contact">Contact</a>
            </li>
          </ul>
        </nav>
      </main>
    </>
  )
}
