import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('../components/Dynamic'))

/** Add your relevant code here for the issue to reproduce */
export default function Works() {
  return <Dynamic />
}
