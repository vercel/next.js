import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'
import reactServer from 'react-server'

export const runtime = 'nodejs'

export function GET() {
  return Response.json({
    edgeThenNode,
    nodeThenEdge,
    reactServer,
  })
}
