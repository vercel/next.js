import { GetServerSideProps } from 'next'
import { Dashboard, Layout, Login } from '../components'
import { getSessionFromCookie, User } from '../lib'

interface Props {
  user: User | null
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  req,
}) => {
  const session = await getSessionFromCookie(req.headers.cookie)

  if (session && new Date(session.expiresAt) > new Date()) {
    return { props: { user: session.user } }
  } else {
    return { props: { user: null } }
  }
}

export default function HomePage({ user }: Props) {
  return <Layout>{user ? <Dashboard user={user} /> : <Login />}</Layout>
}
