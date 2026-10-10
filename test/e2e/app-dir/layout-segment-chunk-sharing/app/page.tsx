import { sharedLayoutValue } from './shared-layout-module'

export default function Page() {
  return <p id="index">{sharedLayoutValue('index')}</p>
}
