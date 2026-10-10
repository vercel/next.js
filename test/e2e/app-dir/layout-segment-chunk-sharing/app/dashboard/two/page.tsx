import { sharedLayoutValue } from '../../shared-layout-module'

export default function PageTwo() {
  return <p id="page-two">{sharedLayoutValue('two')}</p>
}
