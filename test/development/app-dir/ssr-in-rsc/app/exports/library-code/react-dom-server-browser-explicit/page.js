import * as ReactDOMServerBrowser from '@next-test-ssr-in-rsc/internal-pkg/server'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerBrowser, null, 2)}</pre>
    </>
  )
}
