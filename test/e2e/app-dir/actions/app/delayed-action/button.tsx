'use client'

import { useContext } from 'react'
import { action, redirectAction } from './actions'
import { DataContext } from './context'

export function Button() {
  const { setData } = useContext(DataContext)
  const handleClick = async () => {
    await new Promise((res) => setTimeout(res, 1000))

    const result = await action()

    setData(result)
  }

  const handleRedirect = async () => {
    await new Promise((res) => setTimeout(res, 1000))

    const result = await redirectAction()

    setData(result)
  }

  return (
    <>
      <button onClick={handleClick} id="run-action">
        Run Action
      </button>

      <button onClick={handleRedirect} id="run-action-redirect">
        Run Redirect
      </button>
    </>
  )
}
