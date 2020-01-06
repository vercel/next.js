import Link from 'next/link'
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello'))

export default () => (
  <div id="dynamic-imports-page">
    <div>
      <Link href="/">
        <a>Go Back</a>
      </Link>
    </div>
    <DynamicComponent />
  </div>
)
