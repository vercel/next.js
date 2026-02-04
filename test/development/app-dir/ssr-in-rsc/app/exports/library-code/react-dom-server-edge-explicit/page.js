import * as ReactDOMServerEdge from 'internal-pkg/server.edge'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerEdge, null, 2)}</pre>
    </>
  )
}
