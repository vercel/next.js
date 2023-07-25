'use client'

import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'

export const runtime = 'edge'

export default function ClientComponent() {
  return (
    <div id="client">
      {JSON.stringify({
        edgeThenNode,
        nodeThenEdge,
      })}
    </div>
  )
}
