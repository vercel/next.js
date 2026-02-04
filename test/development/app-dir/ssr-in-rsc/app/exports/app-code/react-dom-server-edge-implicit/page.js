import * as ReactDOMServerEdge from 'react-dom/server'
// Fine to drop once React is on ESM
import ReactDOMServerEdgeDefault from 'react-dom/server'

export const runtime = 'edge'

export default function Page() {
  return (
    <pre>
      {JSON.stringify(
        {
          default: Object.keys(ReactDOMServerEdgeDefault).sort(),
          named: Object.keys(ReactDOMServerEdge).sort(),
        },
        null,
        2
      )}
    </pre>
  )
}
