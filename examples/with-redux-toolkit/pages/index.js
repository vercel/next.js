import React from 'react'
import { createAction } from '@reduxjs/toolkit'
import { useDispatch } from 'react-redux'
import { withRedux } from '../lib/redux'
import useInterval from '../lib/useInterval'
import Clock from '../components/clock'
import Counter from '../components/counter'

const tick = createAction('TICK', (light) => {
  return {
    payload: {
      light: light,
      lastUpdate: Date.now(),
    }
  }
})

const IndexPage = () => {
  // Tick the time every second
  const dispatch = useDispatch()
  useInterval(() => {
    dispatch(tick(true))
  }, 1000)
  return (
    <>
      <Clock />
      <Counter />
    </>
  )
}

IndexPage.getInitialProps = ({ reduxStore }) => {
  // Tick the time once, so we'll have a
  // valid time before first render
  const { dispatch } = reduxStore
  dispatch(tick(typeof window === 'object'))
  return {}
}

export default withRedux(IndexPage)
