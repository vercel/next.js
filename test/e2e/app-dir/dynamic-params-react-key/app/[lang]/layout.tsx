import React from 'react'
import ClientComponent from './client-component'

export default function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { lang: string }
}) {
  return (
    <html>
      <head></head>
      <body>
        <div id="params">{JSON.stringify(params)}</div>
        <ClientComponent lang={params.lang} />
        {children}
      </body>
    </html>
  )
}
