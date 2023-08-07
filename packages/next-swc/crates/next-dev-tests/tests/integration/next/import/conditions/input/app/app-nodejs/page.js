import edgeThenNode from 'edge-then-node'
import nodeThenEdge from 'node-then-edge'
import reactServer from 'react-server'
import ClientComponent from '../client'

export const runtime = 'nodejs'

export default function AppNodeJs() {
  return (
    <>
      <div id="server">
        {JSON.stringify({
          edgeThenNode,
          nodeThenEdge,
          reactServer,
        })}
      </div>
      <ClientComponent />
    </>
  )
}
