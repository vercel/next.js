import React from 'react'

export default async function Root({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      Nested Layout
      {children}
    </div>
  )
}
