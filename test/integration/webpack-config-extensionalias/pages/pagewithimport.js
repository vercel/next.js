// import tsx file with .js extension alias, this leads to a build fail if extensionAlias is not configured
import { TsxComponent } from '../components/TsxComponent.js'
export default function PageWithImport() {
  return (
    <>
      See import here: <TsxComponent />
    </>
  )
}
