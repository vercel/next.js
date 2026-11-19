'use client'

import { createContext, useContext } from 'react'

const TestContext = createContext('hello world')

export default function Page() {
  const value = useContext(TestContext)
  return <p>{value}</p>
}
