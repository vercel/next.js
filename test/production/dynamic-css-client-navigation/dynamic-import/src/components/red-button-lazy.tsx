import React, { useEffect, useState } from 'react'

export function RedButtonLazy() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null)

  useEffect(() => {
    import('./red-button').then((module) =>
      setComponent(() => module.RedButton)
    )
  }, [])

  return Component && <Component />
}
