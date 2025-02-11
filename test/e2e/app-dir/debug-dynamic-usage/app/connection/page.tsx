import React from 'react'
import { ServerComp } from './server-comp'
import { connection } from 'next/server'

async function indirect() {
  return await connection()
}

export default function Page() {
  return (
    <>
      <p>This page awaits connection().</p>
      <ServerComp promise={indirect()} />
    </>
  )
}
