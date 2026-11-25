import dynamic from 'next/dynamic'

const DynamicTarget = dynamic(() => import('../lib/pages-dynamic-target'))

export default function Page() {
  return <DynamicTarget />
}
