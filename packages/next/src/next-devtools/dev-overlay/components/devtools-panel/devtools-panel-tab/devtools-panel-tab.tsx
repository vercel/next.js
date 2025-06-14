import type { DevToolsPanelTabType } from '../devtools-panel'

export function DevToolsPanelTab({
  activeTab,
}: {
  activeTab: DevToolsPanelTabType
}) {
  if (activeTab === 'settings') {
    return <div>Settings</div>
  }

  if (activeTab === 'route') {
    return <div>Route</div>
  }

  if (activeTab === 'issues') {
    return <div>Issues</div>
  }

  console.log(
    `[Next.js DevTools] Received unknown Panel Tab: "${activeTab}". This is a bug in Next.js DevTools.`
  )
  return null
}
