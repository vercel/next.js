import * as ReactDOMServerBrowser from 'internal-pkg/server'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerBrowser, null, 2)}</pre>
    </>
  )
}
