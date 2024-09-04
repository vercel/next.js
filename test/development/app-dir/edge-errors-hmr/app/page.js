import { CompServer } from './comp.server'
import { CompClient } from './comp.client'

export const runtime = 'edge'

export default function Home() {
  return (
    <div>
      <CompServer />
      <CompClient />
    </div>
  )
}
