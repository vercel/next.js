import dynamic from 'next/dynamic'

const redButton = 'red-button'
const VariableInsertedDynamicImportRedButton = dynamic(
  () => import(`../components/${redButton}`).then((module) => module.RedButton),
  { ssr: false }
)

export default function Bar() {
  return <VariableInsertedDynamicImportRedButton />
}
