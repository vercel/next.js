import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { END } from 'redux-saga'
import { wrapper } from '../store'
import { loadData, startClock, tickClock } from '../actions'
import Page from '../components/page'

const Index = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(startClock())
  }, [dispatch])

  return <Page title="Index Page" linkTo="/other" NavigateTo="Other Page" />
}

export const getStaticProps = wrapper.getStaticProps(
  (store) =>
    async ({ params }) => {
      await store.dispatch(tickClock(false))

      if (!store.getState().placeholderData) {
        await store.dispatch(loadData())
        store.dispatch(END)
      }

      await store.sagaTask.toPromise()
    }
)

export default Index
