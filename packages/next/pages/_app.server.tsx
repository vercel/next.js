import React from 'react'

export type AppProps = { children: React.ReactNode }
export default function AppServer({ children }: AppProps) {
  return children
}
