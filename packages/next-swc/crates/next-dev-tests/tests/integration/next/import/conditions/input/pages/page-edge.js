import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const config = {
  runtime: 'experimental-edge',
}

export default function PageEdge() {
  return (
    <div id="server">
      {JSON.stringify({
        edgeThenNode,
        nodeThenEdge,
      })}
    </div>
  )
}
