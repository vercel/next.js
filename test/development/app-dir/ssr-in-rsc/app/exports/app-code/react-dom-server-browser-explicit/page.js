import * as ReactDOMServerBrowser from 'react-dom/server.browser'
// Fine to drop once React is on ESM
import ReactDOMServerBrowserDefault from 'react-dom/server.browser'

export default function Page() {
  return (
    <pre>
      {JSON.stringify(
        {
          default: Object.keys(ReactDOMServerBrowserDefault).sort(),
          named: Object.keys(ReactDOMServerBrowser).sort(),
        },
        null,
        2
      )}
    </pre>
  )
}
