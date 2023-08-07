import edgeLightPackage from 'my-edge-light-package'
import edgeLightPackageExports from 'my-edge-light-package-exports'

export const runtime = 'edge'

export default function AppDirPage() {
  return (
    <pre id="result">
      {JSON.stringify({ edgeLightPackage, edgeLightPackageExports }, null, 2)}
    </pre>
  )
}
