import * as ReactDOMServerEdge from '@next-test-ssr-in-rsc/internal-pkg/server'

export const runtime = 'edge'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerEdge, null, 2)}</pre>
    </>
  )
}
