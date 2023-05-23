import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const config = {
  runtime: 'nodejs',
}

export default function PageNodeJs() {
  return JSON.stringify({
    edgeThenNode,
    nodeThenEdge,
  })
}
