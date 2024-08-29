import dynamic from 'next/dynamic'

const redButton = 'red-button'
const VariableInsertedDynamicImportRedButton = dynamic(() =>
  import(`../components/${redButton}`).then((module) => module.RedButton)
)

export default function Bar() {
  return <VariableInsertedDynamicImportRedButton />
}
