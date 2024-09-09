import React from 'react'
import { setTimeout } from 'timers/promises'

export const getData = React.cache(async () => {
  await setTimeout(100)

  return Math.random().toString(10)
})
