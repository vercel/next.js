import * as ReactDOMServerNode from '@next-test-ssr-in-rsc/internal-pkg/server'

export const runtime = 'nodejs'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerNode, null, 2)}</pre>
    </>
  )
}
