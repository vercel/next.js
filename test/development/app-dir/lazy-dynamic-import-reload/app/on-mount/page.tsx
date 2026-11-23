'use client'

import { type ComponentType, useEffect, useState } from 'react'

export default function Page() {
  const [Target, setTarget] = useState<ComponentType | null>(null)
  useEffect(() => {
    import('./target').then((target) => setTarget(() => target.Target))
  }, [])
  return Target ? <Target /> : <p id="value">loading</p>
}
