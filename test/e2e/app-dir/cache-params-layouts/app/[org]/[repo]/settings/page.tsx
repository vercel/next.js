import { Suspense } from 'react'
import { SettingsInfo } from './settings-info'

export default function SettingsPage() {
  return (
    <div id="settings-page">
      <h1>Settings Page</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <SettingsInfo />
      </Suspense>
    </div>
  )
}
