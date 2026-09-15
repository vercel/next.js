import React from 'react'
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return <div id="about-page">About Page</div>
}
