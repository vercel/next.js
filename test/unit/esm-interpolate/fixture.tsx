import React from 'react'
import { useRouter } from 'next/router'

export const Foo = () => {
  const router = useRouter()

  return <div>{router.pathname}</div>
}
