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
      <head>
        <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      </head>
      <body>
        {children}
        {dialog}
        {interception}
      </body>
    </html>
  )
}
