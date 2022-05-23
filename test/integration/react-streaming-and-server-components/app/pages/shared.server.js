import ClientFromDirect from '../components/client.client'
import ClientFromShared from '../components/shared'
import SharedFromClient from '../components/shared.client'
import Random from '../components/random-module-instance.client'

import { random } from 'random-module-instance'

export default function Page() {
  // All three client components should be rendered correctly, but only
  // shared component is a server component, and another is a client component.
  // These two shared components should be created as two module instances.

  // It's expected to have hydration mismatch here.
  return (
    <div id="main" suppressHydrationWarning>
      <Random />
      <br />
      {`node_modules instance from .server.js:` + random}
      <br />
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
