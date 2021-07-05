import Link from 'next/link'
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello'))

const DynamicImports = () => (
  <div id="dynamic-imports-page">
    <div>
      <Link href="/">
        <a>Go Back</a>
      </Link>
    </div>
    <DynamicComponent />
  </div>
)

export default DynamicImports
