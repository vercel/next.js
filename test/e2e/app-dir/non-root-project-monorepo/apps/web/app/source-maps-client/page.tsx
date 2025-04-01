'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(function effectCallback() {
    innerFunction()
  })
  return <p>Hello Source Maps</p>
}

function innerFunction() {
  innerArrowFunction()
}

const innerArrowFunction = () => {
  require('../separate-file')
}
