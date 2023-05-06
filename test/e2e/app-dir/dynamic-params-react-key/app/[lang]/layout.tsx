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
      <div id="params">{JSON.stringify(params)}</div>
      <ClientComponent lang={params.lang} />
      <body>{children}</body>
    </html>
  )
}
