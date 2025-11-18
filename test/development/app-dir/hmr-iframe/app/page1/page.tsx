import { subscribeToHMR } from './subscribeToHMR'
import { Component } from './Component'

const RootPage = async ({ Component }: any) => {
  await subscribeToHMR()

  return (
    <html>
      <body>
        <iframe src="/page2" />
      </body>
    </html>
  )
}

export default function Page() {
  return <RootPage Component={Component} />
}
