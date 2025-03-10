import * as ReactDOMServerNode from 'internal-pkg/server'

export const runtime = 'nodejs'

export default function Page() {
  return (
    <>
      <pre>{JSON.stringify(ReactDOMServerNode, null, 2)}</pre>
    </>
  )
}
