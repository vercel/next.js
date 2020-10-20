import Link from 'next/link'
import UserInfo from '../components/UserInfo'
import { fetchUser } from '../store/actions'
import { initStore } from '../store/store'

export async function getServerSideProps() {
  const { store, shutdownEpics } = initStore()

  await store.dispatch(fetchUser())

  await shutdownEpics()

  return { props: { initialReduxState: store.getState() } }
}

const User = () => {
  return (
    <div>
      <h1>User Page</h1>
      <UserInfo />
      <br />
      <nav>
        <Link href="/other">
          <a>Navigate to "/other"</a>
        </Link>
      </nav>
    </div>
  )
}
export default User
