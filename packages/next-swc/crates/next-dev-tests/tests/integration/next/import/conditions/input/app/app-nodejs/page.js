import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const runtime = 'nodejs'

export default function AppNodeJs() {
  return JSON.stringify({
    edgeThenNode,
    nodeThenEdge,
  })
}
