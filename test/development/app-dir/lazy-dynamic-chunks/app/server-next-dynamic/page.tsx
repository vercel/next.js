import dynamic from 'next/dynamic'

const DynamicValue = dynamic(() => import('./value'))

export default function Page() {
  return <DynamicValue />
}
