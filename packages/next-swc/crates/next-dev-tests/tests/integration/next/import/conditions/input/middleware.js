import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'
import reactServer from 'react-server'

export const config = {
  matcher: '/middleware',
}

export function middleware() {
  return Response.json({
    edgeThenNode,
    nodeThenEdge,
    reactServer,
  })
}
