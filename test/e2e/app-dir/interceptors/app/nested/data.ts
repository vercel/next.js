import React from 'react'
import { setTimeout } from '../time-utils'

export const getData = React.cache(async () => {
  await setTimeout(100)

  return Math.random().toString(10)
})
