import React from 'react'

export default function Root({
  children,
  dialog,
  interception,
}: {
  children: React.ReactNode
  dialog: React.ReactNode
  interception: React.ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {dialog}
        {interception}
      </body>
    </html>
  )
}
