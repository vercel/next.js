'use client'

import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'
import reactServer from 'react-server'

export const runtime = 'edge'

export default function ClientComponent() {
  return (
    <div id="client">
      {JSON.stringify({
        edgeThenNode,
        nodeThenEdge,
        reactServer,
      })}
    </div>
  )
}
