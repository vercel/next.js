import dynamic from 'next/dynamic'

const DynamicImportRedButton = dynamic(() =>
  import('../components/red-button').then((module) => module.RedButton)
)

export default function Foo() {
  return <DynamicImportRedButton />
}
