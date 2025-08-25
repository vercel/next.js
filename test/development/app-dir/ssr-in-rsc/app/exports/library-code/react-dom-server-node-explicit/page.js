import * as ReactDOMServerNode from '@next-test-ssr-in-rsc/internal-pkg/server.node'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerNode, null, 2)}</pre>
    </>
  )
}
