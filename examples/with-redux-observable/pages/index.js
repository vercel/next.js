import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import Link from 'next/link'
import UserInfo from '../components/UserInfo'
import { stopFetchingUsers, startFetchingUsers } from '../store/actions'

const Counter = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(startFetchingUsers())
    return () => {
      dispatch(stopFetchingUsers())
    }
  }, [dispatch])

  return (
    <div>
      <h1>Index Page</h1>
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
export default Counter
