import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import Link from 'next/link'
import { of, Subject } from 'rxjs'
import { StateObservable } from 'redux-observable'
import UserInfo from '../components/UserInfo'
import { rootEpic } from '../redux/epics'
import {
  stopFetchingCharacters,
  startFetchingCharacters,
  fetchCharacter,
} from '../redux/actions'
import { initializeStore } from '../redux/store'

const Counter = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(startFetchingCharacters())
    return () => {
      dispatch(stopFetchingCharacters())
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

export async function getStaticProps() {
  const store = initializeStore()
  const state$ = new StateObservable(new Subject(), store.getState())
  const resultAction = await rootEpic(of(fetchCharacter()), state$).toPromise() // we need to convert Observable to Promise
  store.dispatch(resultAction)

  return { props: {} }
}

export default Counter
