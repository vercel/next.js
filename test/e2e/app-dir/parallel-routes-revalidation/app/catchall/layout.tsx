import React from 'react'

export default function Layout({
  children,
  interception2,
}: {
  children: React.ReactNode
  interception2: React.ReactNode
}) {
  return (
    <div>
      {children}
      {interception2}
    </div>
  )
}
