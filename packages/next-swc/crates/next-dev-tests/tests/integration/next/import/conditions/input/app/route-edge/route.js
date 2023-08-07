import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const runtime = 'edge'

export function GET() {
  return Response.json({
    edgeThenNode,
    nodeThenEdge,
  })
}
