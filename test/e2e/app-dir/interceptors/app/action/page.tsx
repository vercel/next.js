import React from 'react'
import { logWithTime } from '../time-utils'

export default async function Page() {
  await logWithTime('ActionPage', () => Promise.resolve())

  return <p>Action</p>
}
