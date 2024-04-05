import dynamic from 'next/dynamic'
import '../my@style.css'

const Component = dynamic(() => import('../app/client#component'))

export default function Page() {
  return <Component />
}
