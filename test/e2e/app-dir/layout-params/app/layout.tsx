import React from 'react'
import ShowParams from './show-params'

export default function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: {}
}) {
  return (
    <html>
      <head></head>
      <body>
        <div>
          <ShowParams prefix="root" params={params} />
          {children}
        </div>
      </body>
    </html>
  )
}
