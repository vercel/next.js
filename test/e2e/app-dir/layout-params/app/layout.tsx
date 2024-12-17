import React from 'react'
import ShowParams from './show-params'

export default async function Layout(props: {
  children: React.ReactNode
  params: Promise<{}>
}) {
  const params = await props.params

  const { children } = props

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
