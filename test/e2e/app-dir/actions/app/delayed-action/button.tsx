'use client'

import { useContext } from 'react'
import { action } from './actions'
import { DataContext } from './context'

export function Button() {
  const { setData } = useContext(DataContext)
  const handleClick = async () => {
    await new Promise((res) => setTimeout(res, 1000))

    const result = await action()

    setData(result)
  }
  return (
    <button onClick={handleClick} id="run-action">
      Run Action
    </button>
  )
}
