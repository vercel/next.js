import React from 'react'

export default function PRRLayout({
  children,
  dialog,
  interception,
}: {
  children: React.ReactNode
  dialog: React.ReactNode
  interception: React.ReactNode
}) {
  return (
    <>
      {children}
      {dialog}
      {interception}
    </>
  )
}
