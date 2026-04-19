import edgeLightPackage from 'my-edge-light-package'
import edgeLightPackageExports from 'my-edge-light-package-exports'

export const config = { runtime: 'experimental-edge' }

export default function Index() {
  return (
    <pre id="result">
      {JSON.stringify({ edgeLightPackage, edgeLightPackageExports }, null, 2)}
    </pre>
  )
}
