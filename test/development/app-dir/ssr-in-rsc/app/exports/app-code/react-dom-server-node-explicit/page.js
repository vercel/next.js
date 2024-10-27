import * as ReactDOMServerNode from 'react-dom/server.node'
// Fine to drop once React is on ESM
import ReactDOMServerNodeDefault from 'react-dom/server.node'

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
