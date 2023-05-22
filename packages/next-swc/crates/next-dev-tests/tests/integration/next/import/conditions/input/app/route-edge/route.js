import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const runtime = 'edge'

export default function RouteEdge() {
  return Response.json({
    edgeThenNode,
    nodeThenEdge,
  })
}
