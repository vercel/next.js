import React from 'react'
import { hello } from '../components/hello'
import { World } from '../components/world'

export default function HelloPage(): JSX.Element {
  // TEST: verify process.browser extension works
  console.log(process.browser)
  return (
    <div>
      {hello()} <World />
    </div>
  )
}
