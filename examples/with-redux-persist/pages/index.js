import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { startClock, serverRenderClock, initializeStore } from '../store'
import Examples from '../components/examples'

const Index = () => {
  const dispatch = useDispatch()
  useEffect(() => {
    setInterval(() => dispatch(startClock()), 1000)
  }, [dispatch])

  return <Examples />
}

export async function getStaticProps() {
  const store = initializeStore()
  store.dispatch(serverRenderClock())

  return {
    props: {},
  }
}

export default Index
