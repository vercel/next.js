'use client'

import clientGreeting from './client-greeting'

export default function ClientComponent() {
  return <p id="client">{clientGreeting()}</p>
}
