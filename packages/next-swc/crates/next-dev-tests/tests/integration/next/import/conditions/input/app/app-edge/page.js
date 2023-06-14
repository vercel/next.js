import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const runtime = 'edge'

export default function AppEdge() {
  return JSON.stringify({
    edgeThenNode,
    nodeThenEdge,
  })
}
