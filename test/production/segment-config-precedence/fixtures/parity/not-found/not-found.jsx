import { readFileSync } from 'node:fs'

export const runtime = 'nodejs'

export default function NotFound() {
  return (
    <>
      <p id="runtime">{process.env.NEXT_RUNTIME}</p>
      <p id="node-api">{typeof readFileSync}</p>
    </>
  )
}
