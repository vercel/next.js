import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('./components/dynamic'))

export default function Page() {
  return <Dynamic />
}
