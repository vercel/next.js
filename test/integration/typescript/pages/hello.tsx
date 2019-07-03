import React from 'react'
import { hello } from '../components/hello'
import { World } from '../components/world'

export default function HelloPage(): JSX.Element {
  console.log(process.browser)
  return (
    <div>
      {hello()} <World />
    </div>
  )
}
