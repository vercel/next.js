import * as ReactDOMServerEdge from 'react-dom/server.node'
// Fine to drop once React is on ESM
import ReactDOMServerEdgeDefault from 'react-dom/server.node'

const moduleShape = {
  default: Object.keys(ReactDOMServerEdgeDefault).sort(),
  named: Object.keys(ReactDOMServerEdge).sort(),
}

export default moduleShape
