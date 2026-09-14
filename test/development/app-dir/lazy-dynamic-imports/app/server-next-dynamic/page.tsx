import dynamic from 'next/dynamic'

const Value = dynamic(() => import('./value'))

export default function Page() {
  return <Value />
}
