import { routeActivityValue } from '../../../shared/route-activity-value'
import { ClientMarker } from './client-marker'

export default function Page() {
  return (
    <>
      <p id="route-activity-greeting">
        route activity page: {routeActivityValue}
      </p>
      <ClientMarker />
    </>
  )
}
