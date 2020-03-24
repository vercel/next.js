// This import is only needed when checking authentication status directly from getServerSideProps
import auth0 from '../../lib/auth0'
import ProfileCard from '../../components/profile-card'
import Layout from '../../components/layout'

function SSRProfile({ user }) {
  return (
    <>
      <Layout user={user}>
        <h1>Profile (server rendered)</h1>
        <ProfileCard user={user}/>
      </Layout>        
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
