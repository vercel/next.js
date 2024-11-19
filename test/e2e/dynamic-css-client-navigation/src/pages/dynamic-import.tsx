import React, { useEffect, useState } from 'react'

const empty = {}

const useLoadOnClientSide = (loader, fallback) => {
  const [lazyModule, setLazyModule] = useState(empty)
  const skip = lazyModule !== empty

  useEffect(() => {
    if (skip || typeof document === 'undefined') {
      return
    }

    let mounted = true
    loader().then((mod) => {
      if (!mounted) return
      setLazyModule(() => mod)
    })

    return () => {
      mounted = false
    }
  }, [skip, loader])

  return lazyModule === empty ? fallback : lazyModule
}

export default function DynamicImport() {
  const DynamicImportRedButton = useLoadOnClientSide(
    () => import('../components/red-button').then(({ RedButton }) => RedButton),
    null
  )

  return DynamicImportRedButton && <DynamicImportRedButton />
}
