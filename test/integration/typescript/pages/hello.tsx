import React from 'react'
import { useRouter } from 'next/router'
import { hello } from '../components/hello'
import { World } from '../components/world'
import Router from '../components/router'

export default function HelloPage(): JSX.Element {
  // TEST: verify process.browser extension works
  console.log(process.browser)

  // TEST: verify router has its type
  const router = useRouter()
  console.log(router.pathname)
  return (
    <div>
      {hello()} <World />
      <Router />
    </div>
  )
}
