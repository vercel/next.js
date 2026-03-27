import { Suspense } from 'react'
import { connection } from 'next/server'
import { OfflineStatus } from '../../components/offline-status'

async function DynamicContent() {
  await connection()
  return <div id="destination-dynamic">Dynamic data loaded</div>
}

export default function DestinationPage() {
  return (
    <div id="destination-content">
      <h1>Destination page</h1>
      <Suspense
        fallback={
          <div id="destination-loading">
            Waiting for data... <OfflineStatus />
          </div>
        }
      >
        <DynamicContent />
      </Suspense>
    </div>
  )
}
