'use client'

import { useId } from 'react'

export default function Page() {
  let id = useId()

  return (
    <div className="parent" data-id={id}>
      Hello World
    </div>
  )
}
