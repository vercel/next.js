import * as ReactDOMServerNode from 'react-dom/server'
// Fine to drop once React is on ESM
import ReactDOMServerNodeDefault from 'react-dom/server'

export const runtime = 'nodejs'

export default function Page() {
  return (
    <pre>
      {JSON.stringify(
        {
          default: Object.keys(ReactDOMServerNodeDefault).sort(),
          named: Object.keys(ReactDOMServerNode).sort(),
        },
        null,
        2
      )}
    </pre>
  )
}
