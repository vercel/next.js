import { useEffect, useState } from 'react'

export default function Page() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return <p>{hydrated ? 'pages hydrated' : 'pages loading'}</p>
}
