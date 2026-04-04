import { params } from '../../../lib/params'

export async function SettingsInfo() {
  const { org, repo } = await params()
  return (
    <div id="settings-info">
      <span id="settings-info-org">{org}</span>
      <span id="settings-info-repo">{repo}</span>
    </div>
  )
}
