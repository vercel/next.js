import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'
import reactServer from 'react-server'

export const config = {
  runtime: 'edge',
}

export default function ApiEdge() {
  return Response.json({
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    edgeThenNode,
    nodeThenEdge,
    reactServer,
  })
}
