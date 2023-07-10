import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const config = {
  runtime: 'nodejs',
}

export default function ApiNodeJs(req, res) {
  res.status(200).json({
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    edgeThenNode,
    nodeThenEdge,
  })
}
