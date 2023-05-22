import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const runtime = 'nodejs'

export default function RouteNodeJs() {
  return Response.json({
    edgeThenNode,
    nodeThenEdge,
  })
}
