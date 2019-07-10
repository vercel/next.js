import React from 'react'
import { useRouter } from 'next/router'
import { hello } from '../components/hello'
import { World } from '../components/world'
import Router from '../components/router'

export default function HelloPage(): JSX.Element {
  const router = useRouter()
  console.log(process.browser)
  console.log(router.pathname)
  return (
    <div>
      {hello()} <World />
      <Router />
    </div>
  )
}
