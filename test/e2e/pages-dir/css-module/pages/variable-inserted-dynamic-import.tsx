import { useState, useEffect, ComponentType } from 'react'

const redButton = 'red-button'

export default function VariableInsertedDynamicImport() {
  const [
    VariableInsertedDynamicImportRedButton,
    setVariableInsertedDynamicImportRedButton,
  ] = useState<ComponentType<any>>()

  useEffect(() => {
    import(`../components/${redButton}`).then((module) => {
      setVariableInsertedDynamicImportRedButton(() => module.RedButton)
    })
  }, [])

  if (!VariableInsertedDynamicImportRedButton) {
    return <div>Loading...</div>
  }
  return <VariableInsertedDynamicImportRedButton />
}
