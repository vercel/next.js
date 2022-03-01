import ClientFromDirect from '../components/client.client'
import ClientFromShared from '../components/shared'
import SharedFromClient from '../components/shared.client'

export default function Page() {
  // All three client components should be rendered correctly, but only
  // shared component is a server component, and another is a client component.
  // These two shared components should be created as two module instances.
  return (
    <div id="main">
      <ClientFromDirect />
      <br />
      <ClientFromShared />
      <br />
      <ClientFromShared />
      <br />
      <SharedFromClient />
      <br />
      <SharedFromClient />
    </div>
  )
}
