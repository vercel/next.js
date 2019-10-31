import React from 'react'
import { useDispatch } from 'react-redux'
import { withRedux } from '../lib/redux'
import useInterval from '../lib/useInterval'
import Layout from '../components/Layout'
import Clock from '../components/Clock'
import Counter from '../components/Counter'

const ReduxPage = () => {
  // Tick the time every second
  const dispatch = useDispatch()
  useInterval(() => {
    dispatch({
      type: 'TICK',
      light: true,
      lastUpdate: Date.now()
    })
  }, 1000)
  return (
    <Layout>
      <Clock />
      <Counter />
    </Layout>
  )
}

ReduxPage.getInitialProps = ({ reduxStore }) => {
  // Tick the time once, so we'll have a
  // valid time before first render
  const { dispatch } = reduxStore
  dispatch({
    type: 'TICK',
    light: typeof window === 'object',
    lastUpdate: Date.now()
  })

  return {}
}

export default withRedux(ReduxPage)
