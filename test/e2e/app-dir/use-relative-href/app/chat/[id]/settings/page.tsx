import { RelativeHrefs } from '../../../relative-hrefs'

export default function SettingsPage() {
  return (
    <>
      <div id="settings-page">Settings</div>
      <RelativeHrefs
        id="settings-page-hrefs"
        targets={['/chat', '/chat/[id]', '/', '/pricing']}
      />
    </>
  )
}
