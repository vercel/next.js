import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'
import reactServer from 'react-server'

export const config = {
  runtime: 'nodejs',
}

export default function ApiNodeJs(req, res) {
  res.status(200).json({
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    edgeThenNode,
    nodeThenEdge,
    reactServer,
  })
}
