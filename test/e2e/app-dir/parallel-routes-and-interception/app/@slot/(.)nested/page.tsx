import React from 'react'
import { Client } from './client'

export default function Page() {
  return (
    <>
      <p id="interception-slot">interception from @slot/nested</p>
      <Client />
    </>
  )
}
