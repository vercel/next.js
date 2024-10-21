import React from 'react'
import ShowParams from './show-params'

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{}>
}) {
  return (
    <html>
      <head></head>
      <body>
        <div>
          <ShowParams prefix="root" params={await params} />
          {children}
        </div>
      </body>
    </html>
  )
}
