import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import Page from '../components/Page'
import { add } from '../store/counterSlice'
import { wrapper } from '../store/store'
import { startClock, serverRenderClock } from '../store/tickSlice'

const Index = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    const timer = dispatch(startClock())

    return () => {
      clearInterval(timer)
    }
  }, [dispatch])

  return <Page title="Index Page" linkTo="/other" />
}

export const getStaticProps = wrapper.getStaticProps((store) => () => {
  store.dispatch(serverRenderClock(true))
  store.dispatch(add())

  return {}
})

export default Index
