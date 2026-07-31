import { trackedServerAction } from './actions'
import { ServerActionControls } from './client'

export default function Page() {
  return <ServerActionControls trackedServerAction={trackedServerAction} />
}
