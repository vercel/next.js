import React from 'react'
import { withZustand } from '../lib/zustand'
import useInterval from '../lib/useInterval'
import Clock from '../components/clock'
import { NextPage, NextPageContext } from 'next'
import { ZustandContext, useZustand } from '../store'

const IndexPage: NextPage = () => {
  // Tick the time every second
  const { tick } = useZustand()
  useInterval(() => {
    tick({
      light: true,
      lastUpdate: Date.now(),
    })
  }, 1000)
  return (
    <>
      <Clock />
    </>
  )
}

IndexPage.getInitialProps = ({
  zustandStore,
}: NextPageContext & ZustandContext) => {
  // Tick the time once, so we'll have a
  // valid time before first render

  // by using the setState method
  if (Math.random() < 0.5) {
    zustandStore.setState({
      light: typeof window === 'object',
      lastUpdate: Date.now(),
    })
  } else {
    // or the "dispatch" function (both works)
    const { tick } = zustandStore.getState()
    tick({
      light: typeof window === 'object',
      lastUpdate: Date.now(),
    })
  }

  return {}
}

export default withZustand(IndexPage)
