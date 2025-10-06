import { foo } from '../module-with-long-name'
import { bar } from '../node_modules/external-module-with-long-name'
import dynamic from 'next/dynamic'

const DynamicCustomComponent = dynamic(
  () => import('../components/CustomComponent'),
  {
    loading: () => <p>Loading...</p>,
  }
)

export default function Index() {
  return (
    <div>
      <DynamicCustomComponent />
      {foo} {bar}
    </div>
  )
}
