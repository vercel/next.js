import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import Page from '../components/Page'
import { wrapper } from '../store/store'
import { add } from '../store/counterSlice'
import { startClock, serverRenderClock } from '../store/tickSlice'

const Other = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    const timer = dispatch(startClock())

    return () => {
      clearInterval(timer)
    }
  }, [dispatch])

  return <Page title="Other Page" linkTo="/" />
}

export const getServerSideProps = wrapper.getServerSideProps((store) => () => {
  store.dispatch(serverRenderClock(true))
  store.dispatch(add())

  return {}
})

export default Other
