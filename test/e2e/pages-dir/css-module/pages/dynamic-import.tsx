import { useState, useEffect, ComponentType } from 'react'

export default function DynamicImport() {
  const [DynamicImportRedButton, setDynamicImportRedButton] =
    useState<ComponentType<any>>()

  useEffect(() => {
    import('../components/red-button').then((module) => {
      setDynamicImportRedButton(() => module.RedButton)
    })
  }, [])

  if (!DynamicImportRedButton) {
    return <div>Loading...</div>
  }
  return <DynamicImportRedButton />
}
