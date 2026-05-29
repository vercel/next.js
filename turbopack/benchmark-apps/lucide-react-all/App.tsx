import * as React from 'react'
import * as Icons from 'lucide-react'

export default function Home() {
  const dynamicName = 'Camera'
  const Icon = Icons[dynamicName]
  return (
    <div>
      <Icon />
    </div>
  )
}
