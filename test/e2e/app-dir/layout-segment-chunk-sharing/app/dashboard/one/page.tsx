import { sharedLayoutValue } from '../../shared-layout-module'

export default function PageOne() {
  return <p id="page-one">{sharedLayoutValue('one')}</p>
}
