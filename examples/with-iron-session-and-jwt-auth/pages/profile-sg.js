import useUser from '../lib/useUser'
import Layout from '../components/Layout'
import Link from 'next/link'

const SgProfile = () => {
  const { user } = useUser({ redirectTo: '/login' })

  if (!user || user.isLoggedIn === false) {
    return <Layout>loading...</Layout>
  }

  return (
    <Layout>
      <h1>Your GitHub profile</h1>
      <h2>
        This page uses{' '}
        <a href="https://nextjs.org/docs/basic-features/pages#static-generation-recommended">
          Static Generation (SG)
        </a>{' '}
        and the <Link href="/api/user">/api/user</Link> route (using{' '}
        <a href="https://github.com/vercel/swr">SWR</a>)
      </h2>
      
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </Layout>
  )
}


export default SgProfile
