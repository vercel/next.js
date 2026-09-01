import { something } from './non-existent-module'

export default function MissingModulePage() {
  return <div>{something}</div>
}
