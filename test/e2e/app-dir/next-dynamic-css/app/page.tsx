import React from 'react'
import './global2.css'
import Inner2 from './inner2'
import { cookies } from 'next/headers'

export default function Page() {
  cookies()
  return (
    <>
      <Inner2 />
    </>
  )
}
