import '../client-sideeffect-only'
import { Component } from '../client-sideeffect-reexport'

export default function Home() {
  return (
    <div>
      Server
      <Component />
    </div>
  )
}
