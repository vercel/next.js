'use client'

export const runtime = 'edge'

import { useState } from 'react'
import { DataContext } from './context'

export default function Layout({ children }) {
  const [data, setData] = useState<number | null>(null)

  return (
    <DataContext.Provider value={{ data, setData }}>
      <div>{children}</div>
      <div id="delayed-action-result">{data ?? '<null>'}</div>
    </DataContext.Provider>
  )
}
