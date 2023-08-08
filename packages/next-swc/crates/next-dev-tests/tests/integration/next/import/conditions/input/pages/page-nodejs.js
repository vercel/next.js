import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'
import reactServer from 'react-server'

export const config = {
  runtime: 'nodejs',
}

export default function PageNodeJs() {
  return (
    <div id="server">
      {JSON.stringify({
        edgeThenNode,
        nodeThenEdge,
        reactServer,
      })}
    </div>
  )
}
