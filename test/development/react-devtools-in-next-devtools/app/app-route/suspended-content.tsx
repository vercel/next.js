import { connection } from 'next/server'
import AppRouteMarker from './app-route-marker'

export default async function AppRouteSuspendedContent() {
  await connection()

  return <AppRouteMarker />
}
