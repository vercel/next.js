import React from 'react'
import { cookies } from 'next/headers'

export default async function Page() {
  try {
    await cookies()
  } catch (err) {}
  return <div>Hello World</div>
}
