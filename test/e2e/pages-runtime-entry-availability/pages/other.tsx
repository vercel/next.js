import { sharedModuleMarker } from '../lib/shared'

export default function Page() {
  return <p id="other-marker">{sharedModuleMarker()}</p>
}
