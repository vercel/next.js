import { subscribeToHMR } from './subscribeToHMR'
import { Component } from './Component'

// The (unused) client component prop is crucial to reproduce the issue. It will
// be serialized as a client reference in the props of this component, which
// acts as the owner of the I/O inside subscribeToHMR, which is also serialized
// as part of the async I/O sequence in page 2.
const RootPage = async ({ Component }: { Component: React.ComponentType }) => {
  await subscribeToHMR()

  return (
    <html>
      <body>
        <iframe src="/page2" />
      </body>
    </html>
  )
}

export default function Page1() {
  return <RootPage Component={Component} />
}
