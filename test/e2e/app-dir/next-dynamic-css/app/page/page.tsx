import React from 'react'
import './global2.css'
import Inner2 from './inner2'
import { cookies } from 'next/headers'

export default async function Page() {
  await cookies()
  return (
    <>
      <p id="global">Hello Global</p>
      <Inner2 />
    </>
  )
}
