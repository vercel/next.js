import React from 'react'
import { cookies } from 'next/headers'

export default async function Page() {
  try {
    cookies()
  } catch (err) {
    throw new Error(
      "Throwing a new error from 'no-suspense-boundary-re-throwing-error'"
    )
  }
  return <div>Hello World</div>
}
