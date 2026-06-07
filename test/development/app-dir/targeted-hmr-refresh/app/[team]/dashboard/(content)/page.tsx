import { connection } from 'next/server'
import { sharedOwnerValue } from '../shared-owner'
import { SharedMarker } from './shared'

export default async function DashboardPage() {
  await connection()

  return (
    <>
      <p id="page-marker">page-initial</p>
      <p id="page-shared-owner-marker">{sharedOwnerValue}</p>
      <SharedMarker />
    </>
  )
}
