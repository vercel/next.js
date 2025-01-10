import React from 'react'
import { draftMode } from 'next/headers'

export default function Page() {
  return <button disabled={draftMode().isEnabled}>Enable Draft Mode</button>
}
