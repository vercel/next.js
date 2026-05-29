import * as ReactDOMServerEdge from 'internal-pkg/server'

export const runtime = 'edge'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerEdge, null, 2)}</pre>
    </>
  )
}
