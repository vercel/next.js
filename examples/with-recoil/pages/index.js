import React from 'react'
import { useSetRecoilState } from 'recoil'
import { timeState } from '../recoilAtoms'

import useInterval from '../lib/useInterval'
import Clock from '../components/clock'
import Counter from '../components/counter'

const IndexPage = () => {
  const tick = useSetRecoilState(timeState)

  // Tick the time every second
  useInterval(() => {
    tick()
  }, 1000)

  return (
    <>
      <Clock />
      <Counter />
    </>
  )
}

export default IndexPage
