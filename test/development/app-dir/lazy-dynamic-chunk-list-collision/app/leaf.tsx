import { useEffect, useState } from 'react'

export default function Leaf() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  return <p data-hydrated={hydrated}>Lazy leaf</p>
}
