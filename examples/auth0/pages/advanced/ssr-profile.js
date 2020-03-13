// This import is only needed when checking authentication status directly from getServerSideProps
import auth0 from '../../lib/auth0'
import ProfileCard from '../../components/profile-card'
import Header from '../../components/header'
import Head from 'next/head'

function SSRProfile({ user }) {
  return (
    <>
      <Head>
        <title>Next.js with Auth0</title>
      </Head>
      <Header SSRUser={user} />
      <main>
        <div className="container">
          <h1>Profile (server rendered)</h1>
          <ProfileCard SSRUser={user} />
        </div>
      </main>
      <style jsx global>
        {`
          body {
            margin: 0;
            color: #333;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
              Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',
              sans-serif;
          }

          .container {
            max-width: 42rem;
            margin: 1.5rem auto;
          }
        `}
      </style>
    </>
  )
}

export async function getServerSideProps({ req, res }) {
  // On the server-side you can check authentication status directly
  // However in general you might want to call API Routes to fetch data
  // An example of directly checking authentication:
  const session = await auth0.getSession(req)
  if (!session || !session.user) {
    res.writeHead(302, { Location: '/api/login' })
    res.end()
    return
  }
  return { props: { user: session.user } }

  // To do fetches to API routes you can pass the cookie coming from the incoming request on to the fetch
  // so that a request to the API is done on behalf of the user
  // keep in mind that server-side fetches need a full URL, meaning that the full url has to be provided to the application
  // Exmaple:
  /*
    const cookie = req && req.headers.cookie
    const response = await fetchSomeAPIRoute(cookie)
  */
}

export default SSRProfile
